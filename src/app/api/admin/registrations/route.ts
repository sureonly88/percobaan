import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { createNotificationSafe } from "@/lib/notifications";

function adminOnly(role: string | undefined) {
  if (role !== "admin") {
    return NextResponse.json({ error: "Hanya admin yang dapat mengakses ini" }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/admin/registrations?status=pending&page=1&pageSize=20
 * List pendaftar berdasarkan status: pending | aktif | ditolak | semua
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const deny = adminOnly(role);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status") || "pending";
  const search   = searchParams.get("search") || "";
  const page     = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
  const offset   = (page - 1) * pageSize;

  const params: (string | number)[] = [];
  let where = "WHERE 1=1";

  if (status !== "semua") {
    where += " AND u.status = ?";
    params.push(status);
  }

  if (search) {
    where += " AND (u.username LIKE ? OR u.name LIKE ? OR u.phone LIKE ? OR u.nama_usaha LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  try {
    const [[{ total }]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM users u ${where}`,
      params
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.name, u.email, u.phone,
              u.nama_usaha, u.alamat_usaha, u.catatan_tolak,
              u.status, u.role, u.loket_id, u.created_at,
              l.loket_code, l.nama AS loket_name
         FROM users u
         LEFT JOIN lokets l ON u.loket_id = l.id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const pendingCount = await getPendingCount();

    return NextResponse.json({
      registrations: rows.map(r => ({
        id:            r.id,
        username:      r.username,
        name:          r.name,
        email:         r.email,
        phone:         r.phone,
        namaUsaha:     r.nama_usaha,
        alamatUsaha:   r.alamat_usaha,
        catatanTolak:  r.catatan_tolak,
        status:        r.status,
        role:          r.role,
        loketId:       r.loket_id,
        loketCode:     r.loket_code,
        loketName:     r.loket_name,
        createdAt:     r.created_at,
      })),
      pagination: {
        total:      Number(total),
        page,
        pageSize,
        totalPages: Math.ceil(Number(total) / pageSize),
      },
      pendingCount,
    });
  } catch (err) {
    console.error("GET /api/admin/registrations:", err);
    return NextResponse.json({ error: "Gagal mengambil data" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/registrations
 * Body: { id, action: 'approve' | 'reject', catatanTolak? }
 *
 * approve → status='aktif', auto-create loket, assign loket_id
 * reject  → status='ditolak', simpan catatanTolak
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const adminName = (session?.user as { name?: string })?.name || "admin";
  const deny = adminOnly(role);
  if (deny) return deny;

  let body: { id?: number; action?: string; catatanTolak?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const { id, action, catatanTolak } = body;
  if (!id || !action) {
    return NextResponse.json({ error: "id dan action wajib diisi" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action harus 'approve' atau 'reject'" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch user
    const [[user]] = await conn.query<RowDataPacket[]>(
      "SELECT id, username, name, status FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    if (!user) {
      await conn.rollback();
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    if (user.status !== "pending") {
      await conn.rollback();
      return NextResponse.json({ error: `User sudah dalam status '${user.status}'` }, { status: 409 });
    }

    if (action === "reject") {
      await conn.query(
        "UPDATE users SET status='ditolak', catatan_tolak=? WHERE id=?",
        [catatanTolak?.trim() || null, id]
      );
      await conn.commit();

      await createNotificationSafe({
        recipientUsername: user.username,
        recipientRole: null,
        category: "sistem",
        severity: "warning",
        title: "Pendaftaran Tidak Disetujui",
        message: catatanTolak?.trim()
          ? `Pendaftaran Anda ditolak oleh admin. Alasan: ${catatanTolak.trim()}`
          : "Pendaftaran Anda tidak disetujui oleh admin. Silakan hubungi admin untuk informasi lebih lanjut.",
        link: "/login",
      });

      return NextResponse.json({ message: "Pendaftaran ditolak" });
    }

    // ── Approve: create loket automatically ──────────────────────────────
    const loketCode = `L${user.username.toUpperCase().slice(0, 8)}${id}`;

    const [loketResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO lokets (nama, loket_code, status, pulsa, biaya_admin, pln_admin_tier, jenis)
       VALUES (?, ?, 'aktif', 0, 2500, 3000, 'KASIR')`,
      [`Loket ${user.name || user.username}`, loketCode]
    );

    await conn.query(
      "UPDATE users SET status='aktif', loket_id=?, is_loket_admin=1, catatan_tolak=NULL WHERE id=?",
      [loketResult.insertId, id]
    );

    await conn.commit();

    await createNotificationSafe({
      recipientUsername: user.username,
      recipientRole: null,
      category: "sistem",
      severity: "success",
      title: "Pendaftaran Disetujui!",
      message: `Selamat! Akun Anda telah disetujui. Loket Anda: ${loketCode}. Silakan login untuk mulai bertransaksi.`,
      link: "/",
    });

    return NextResponse.json({
      message: `Pendaftaran ${user.username} disetujui. Loket ${loketCode} dibuat otomatis.`,
      loketCode,
      loketId: loketResult.insertId,
    });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/admin/registrations:", err);
    return NextResponse.json({ error: "Gagal memproses aksi" }, { status: 500 });
  } finally {
    conn.release();
  }
}

async function getPendingCount(): Promise<number> {
  const [[row]] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) as c FROM users WHERE status='pending'"
  );
  return Number(row?.c ?? 0);
}
