import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";

// GET: Daftar loket + performa
export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/loket", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });
  try {
    // Ambil semua loket
    const [lokets] = await pool.query<RowDataPacket[]>(`
      SELECT * FROM lokets ORDER BY nama ASC
    `);

    // Performa per loket from unified multi_payment_items
    const txDate = "COALESCE(i.paid_at, i.created_at)";
    const baseFrom = `FROM multi_payment_items i JOIN multi_payment_requests r ON r.id = i.multi_payment_id`;

    const [perfAll] = await pool.query<RowDataPacket[]>(`
      SELECT r.loket_code, COUNT(*) as trx, COALESCE(SUM(i.total),0) as nominal
      ${baseFrom}
      WHERE i.status = 'SUCCESS'
        AND MONTH(${txDate}) = MONTH(CURDATE()) AND YEAR(${txDate}) = YEAR(CURDATE())
      GROUP BY r.loket_code
    `);

    const [perfAllLalu] = await pool.query<RowDataPacket[]>(`
      SELECT r.loket_code, COUNT(*) as trx, COALESCE(SUM(i.total),0) as nominal
      ${baseFrom}
      WHERE i.status = 'SUCCESS'
        AND MONTH(${txDate}) = MONTH(CURDATE() - INTERVAL 1 MONTH)
        AND YEAR(${txDate}) = YEAR(CURDATE() - INTERVAL 1 MONTH)
      GROUP BY r.loket_code
    `);

    const [totalAll] = await pool.query<RowDataPacket[]>(`
      SELECT r.loket_code, COUNT(*) as trx, COALESCE(SUM(i.total),0) as nominal
      ${baseFrom}
      WHERE i.status = 'SUCCESS'
      GROUP BY r.loket_code
    `);

    // Build lookup maps
    const mapPerf = new Map<string, { trx: number; nominal: number }>();
    const mapPerfLalu = new Map<string, { trx: number; nominal: number }>();
    const mapTotal = new Map<string, { trx: number; nominal: number }>();

    for (const r of perfAll) {
      mapPerf.set(r.loket_code, { trx: Number(r.trx), nominal: Number(r.nominal) });
    }
    for (const r of perfAllLalu) {
      mapPerfLalu.set(r.loket_code, { trx: Number(r.trx), nominal: Number(r.nominal) });
    }
    for (const r of totalAll) {
      mapTotal.set(r.loket_code, { trx: Number(r.trx), nominal: Number(r.nominal) });
    }

    const result = lokets.map((l) => {
      const perf = mapPerf.get(l.loket_code) || { trx: 0, nominal: 0 };
      const perfLalu = mapPerfLalu.get(l.loket_code) || { trx: 0, nominal: 0 };
      const total = mapTotal.get(l.loket_code) || { trx: 0, nominal: 0 };
      const growth = perfLalu.nominal > 0
        ? ((perf.nominal - perfLalu.nominal) / perfLalu.nominal * 100)
        : 0;

      return {
        id: l.id,
        loketCode: l.loket_code,
        nama: l.nama || "-",
        alamat: l.alamat || "",
        status: l.status || "aktif",
        jenis: l.jenis || "",
        pulsa: Number(l.pulsa || 0),
        biayaAdmin: Number(l.biaya_admin ?? 0),
        plnAdminTier: Number(l.pln_admin_tier ?? 3000),
        maxPdamTagihan: l.max_pdam_tagihan != null ? Number(l.max_pdam_tagihan) : null,
        isBlok: l.is_blok === 1,
        blokMessage: l.blok_message || "",
        byadmin: l.byadmin || "",
        createdAt: l.created_at,
        bulanIni: { trx: perf.trx, nominal: perf.nominal },
        bulanLalu: { trx: perfLalu.trx, nominal: perfLalu.nominal },
        total: { trx: total.trx, nominal: total.nominal },
        growth: +growth.toFixed(1),
      };
    });

    return NextResponse.json({ lokets: result });
  } catch (error) {
    console.error("Loket GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data loket" }, { status: 500 });
  }
}

// POST: Tambah loket baru
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/loket", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { loketCode, nama, alamat, jenis, pulsa, biayaAdmin, isBlok, blokMessage, byadmin } = body;

    if (!loketCode || !nama) {
      return NextResponse.json({ error: "Kode loket dan nama wajib diisi" }, { status: 400 });
    }

    // Check duplicate
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT loket_code FROM lokets WHERE loket_code = ?",
      [loketCode]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Kode loket sudah ada" }, { status: 409 });
    }

    await pool.query<ResultSetHeader>(
      "INSERT INTO lokets (loket_code, nama, alamat, jenis, pulsa, biaya_admin, is_blok, blok_message, byadmin, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif')",
      [loketCode, nama, alamat || "", jenis || "", Number(pulsa || 0), Number(biayaAdmin ?? 0), isBlok ? 1 : 0, blokMessage || "", byadmin || ""]
    );

    return NextResponse.json({ message: "Loket berhasil ditambahkan" });
  } catch (error) {
    console.error("Loket POST Error:", error);
    return NextResponse.json({ error: "Gagal menambah loket" }, { status: 500 });
  }
}

// PUT: Edit loket
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/loket", "PUT");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  try {
    const body = await request.json();
    const { loketCode, nama, alamat, status, jenis, pulsa, biayaAdmin, isBlok, blokMessage, byadmin } = body;

    if (!loketCode) {
      return NextResponse.json({ error: "Kode loket wajib diisi" }, { status: 400 });
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (nama !== undefined) { fields.push("nama = ?"); values.push(nama); }
    if (alamat !== undefined) { fields.push("alamat = ?"); values.push(alamat); }
    if (status !== undefined) { fields.push("status = ?"); values.push(status); }
    if (jenis !== undefined) { fields.push("jenis = ?"); values.push(jenis); }
    if (pulsa !== undefined) { fields.push("pulsa = ?"); values.push(Number(pulsa)); }
    if (biayaAdmin !== undefined) { fields.push("biaya_admin = ?"); values.push(Number(biayaAdmin)); }
    if (isBlok !== undefined) { fields.push("is_blok = ?"); values.push(isBlok ? 1 : 0); }
    if (blokMessage !== undefined) { fields.push("blok_message = ?"); values.push(blokMessage); }
    if (byadmin !== undefined) { fields.push("byadmin = ?"); values.push(byadmin); }
    if (body.plnAdminTier !== undefined) { fields.push("pln_admin_tier = ?"); values.push(Number(body.plnAdminTier)); }
    if (body.maxPdamTagihan !== undefined) {
      fields.push("max_pdam_tagihan = ?");
      values.push(body.maxPdamTagihan === null ? null : Number(body.maxPdamTagihan));
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Tidak ada data yang diubah" }, { status: 400 });
    }

    values.push(loketCode);
    await pool.query<ResultSetHeader>(
      `UPDATE lokets SET ${fields.join(", ")} WHERE loket_code = ?`,
      values
    );

    return NextResponse.json({ message: "Loket berhasil diperbarui" });
  } catch (error) {
    console.error("Loket PUT Error:", error);
    return NextResponse.json({ error: "Gagal memperbarui loket" }, { status: 500 });
  }
}
