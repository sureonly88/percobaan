import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import bcrypt from "bcryptjs";

type SessionUser = {
  username?: string;
  role?: string;
  loketId?: number;
  isLoketAdmin?: boolean;
};

/**
 * GET /api/loket/members[?loketId=X]
 * - kasir: own loket (no param needed)
 * - admin/supervisor: ?loketId=X required
 *
 * Response: { members[], loket{}, canManage, canDelete }
 *   canManage = system admin OR kasir with is_loket_admin=1
 *   canDelete = system admin only
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const su = session?.user as SessionUser | undefined;
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, loketId: sessionLoketId, isLoketAdmin } = su;
  const isSystemAdmin = role === "admin";
  const isSupervisor  = role === "supervisor";

  let targetLoketId: number;
  if (isSystemAdmin || isSupervisor) {
    const q = request.nextUrl.searchParams.get("loketId");
    if (!q) return NextResponse.json({ error: "Parameter loketId diperlukan untuk admin" }, { status: 400 });
    targetLoketId = Number(q);
  } else if (role === "kasir") {
    if (!sessionLoketId) return NextResponse.json({ error: "Akun Anda belum terhubung ke loket" }, { status: 403 });
    targetLoketId = Number(sessionLoketId);
  } else {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.status, u.is_loket_admin, u.created_at
         FROM users u
        WHERE u.loket_id = ?
        ORDER BY u.is_loket_admin DESC, u.created_at ASC`,
      [targetLoketId]
    );

    const [loketRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, nama, loket_code FROM lokets WHERE id = ? LIMIT 1",
      [targetLoketId]
    );
    const loket = loketRows[0] ?? null;

    const canManage = isSystemAdmin || (role === "kasir" && isLoketAdmin === true);
    const canDelete = isSystemAdmin;

    return NextResponse.json({
      members: rows.map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        isLoketAdmin: r.is_loket_admin === 1,
        createdAt: r.created_at,
      })),
      loket: loket ? { id: loket.id, nama: loket.nama, loketCode: loket.loket_code } : null,
      canManage,
      canDelete,
    });
  } catch (err) {
    console.error("GET /api/loket/members:", err);
    return NextResponse.json({ error: "Gagal mengambil data" }, { status: 500 });
  }
}

/**
 * POST /api/loket/members
 * Create a kasir user in the loket.
 * - kasir: must have is_loket_admin=1; creates in own loket
 * - admin: can pass loketId in body to target any loket
 * Body: { username, password, name, email?, loketId? }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const su = session?.user as SessionUser | undefined;
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, loketId: sessionLoketId, isLoketAdmin } = su;
  const isSystemAdmin = role === "admin";

  // Only system admin OR loket-admin kasir can create users
  if (!isSystemAdmin && !(role === "kasir" && isLoketAdmin)) {
    return NextResponse.json({ error: "Hanya admin loket yang dapat menambah user baru" }, { status: 403 });
  }
  if (role === "kasir" && !sessionLoketId) {
    return NextResponse.json({ error: "Akun Anda belum terhubung ke loket" }, { status: 403 });
  }

  let body: { username?: string; password?: string; name?: string; email?: string; loketId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name     = typeof body.name     === "string" ? body.name.trim() : "";
  const email    = typeof body.email    === "string" ? body.email.trim().toLowerCase() : "";

  // For admin: allow specifying a target loket
  const targetLoketId = isSystemAdmin && body.loketId
    ? Number(body.loketId)
    : Number(sessionLoketId);

  if (!username || !password || !name) {
    return NextResponse.json({ error: "Username, password, dan nama lengkap wajib diisi" }, { status: 400 });
  }
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return NextResponse.json({ error: "Username hanya boleh huruf kecil, angka, dan underscore (3–30 karakter)" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
  }

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Username sudah digunakan" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO users (username, password, name, email, role, loket_id, status, is_loket_admin)
       VALUES (?, ?, ?, ?, 'kasir', ?, 'aktif', 0)`,
      [username, hashedPassword, name, email || null, targetLoketId]
    );

    return NextResponse.json(
      { message: "User berhasil dibuat", id: result.insertId },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/loket/members:", err);
    return NextResponse.json({ error: "Gagal membuat user" }, { status: 500 });
  }
}

/**
 * PUT /api/loket/members
 * Update member data.
 * - kasir (is_loket_admin): can update name, email, password, status (aktif/nonaktif) for others in same loket
 * - admin: all of above + can toggle is_loket_admin via setLoketAdmin
 * Body: { id, name?, email?, newPassword?, status?, setLoketAdmin? }
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const su = session?.user as SessionUser | undefined;
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, loketId: sessionLoketId, isLoketAdmin, username: callerUsername } = su;
  const isSystemAdmin = role === "admin";

  if (!isSystemAdmin && !(role === "kasir" && isLoketAdmin)) {
    return NextResponse.json({ error: "Hanya admin loket yang dapat mengelola user" }, { status: 403 });
  }

  let body: { id?: number; name?: string; email?: string; newPassword?: string; status?: string; setLoketAdmin?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const { id, name, email, newPassword, setLoketAdmin } = body;
  if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });

  const statusValue = typeof body.status === "string" ? body.status : undefined;
  if (statusValue && !["aktif", "nonaktif"].includes(statusValue)) {
    return NextResponse.json({ error: "Status hanya boleh 'aktif' atau 'nonaktif'" }, { status: 400 });
  }

  try {
    const [targetRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, loket_id, username FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    const target = targetRows[0];
    if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    if (role === "kasir") {
      if (!sessionLoketId || Number(target.loket_id) !== Number(sessionLoketId)) {
        return NextResponse.json({ error: "Tidak bisa mengelola user di loket lain" }, { status: 403 });
      }
      if (target.username === callerUsername) {
        return NextResponse.json({ error: "Gunakan halaman profil untuk mengubah data Anda sendiri" }, { status: 403 });
      }
      if (setLoketAdmin !== undefined) {
        return NextResponse.json({ error: "Hanya admin sistem yang dapat mengubah status admin loket" }, { status: 403 });
      }
    }

    const fields: string[] = ["updated_at = NOW()"];
    const values: (string | number | null)[] = [];

    if (name !== undefined) { fields.push("name = ?"); values.push(name.trim() || null); }
    if (email !== undefined) { fields.push("email = ?"); values.push(email.trim() || null); }
    if (statusValue !== undefined) { fields.push("status = ?"); values.push(statusValue); }
    if (newPassword) {
      if (newPassword.length < 6) return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
      fields.push("password = ?");
      values.push(await bcrypt.hash(newPassword, 10));
    }
    if (isSystemAdmin && setLoketAdmin !== undefined) {
      fields.push("is_loket_admin = ?");
      values.push(setLoketAdmin ? 1 : 0);
    }

    if (fields.length === 1) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });

    await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);

    return NextResponse.json({ message: "User berhasil diperbarui" });
  } catch (err) {
    console.error("PUT /api/loket/members:", err);
    return NextResponse.json({ error: "Gagal memperbarui user" }, { status: 500 });
  }
}

/**
 * DELETE /api/loket/members?id=X
 * Hard delete — system admin only.
 * Kasir with is_loket_admin should use PUT status='nonaktif' to deactivate.
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const su = session?.user as SessionUser | undefined;
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (su.role !== "admin") {
    return NextResponse.json({ error: "Hanya admin sistem yang dapat menghapus user. Gunakan fitur nonaktifkan untuk menonaktifkan user." }, { status: 403 });
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Parameter id diperlukan" }, { status: 400 });

  try {
    const [targetRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, username FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    const target = targetRows[0];
    if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    if (target.username === su.username) {
      return NextResponse.json({ error: "Tidak bisa menghapus akun Anda sendiri" }, { status: 403 });
    }

    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    return NextResponse.json({ message: "User berhasil dihapus" });
  } catch (err) {
    console.error("DELETE /api/loket/members:", err);
    return NextResponse.json({ error: "Gagal menghapus user" }, { status: 500 });
  }
}
