import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";

// GET: list saldo history + loket saldo info
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/saldo", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const loketCode = searchParams.get("loketCode");

  try {
    // Get all active lokets with saldo
    const [lokets] = await pool.query<RowDataPacket[]>(
      "SELECT id, loket_code, nama, pulsa FROM lokets WHERE status = 'aktif' ORDER BY nama ASC"
    );

    // Get saldo history
    let historyQuery = `
      SELECT rs.id, rs.request_code, rs.username, rs.kode_loket, rs.request_saldo,
             rs.tgl_request, rs.ket_request, rs.is_verifikasi, rs.verifikasi_saldo,
             rs.username_verifikasi, rs.tgl_verifikasi, rs.status_verifikasi, rs.ket_verifikasi,
             l.nama as loket_nama, l.pulsa as saldo_sekarang
      FROM request_saldo rs
      LEFT JOIN lokets l ON l.loket_code = rs.kode_loket
    `;
    const params: string[] = [];

    if (loketCode) {
      historyQuery += " WHERE rs.kode_loket = ?";
      params.push(loketCode);
    }

    historyQuery += " ORDER BY rs.tgl_request DESC LIMIT 100";

    const [history] = await pool.query<RowDataPacket[]>(historyQuery, params);

    return NextResponse.json({
      lokets: lokets.map((l) => ({
        id: l.id,
        loketCode: l.loket_code,
        nama: l.nama,
        pulsa: Number(l.pulsa || 0),
      })),
      history: history.map((h) => ({
        id: h.id,
        requestCode: h.request_code,
        username: h.username,
        loketCode: h.kode_loket,
        loketNama: h.loket_nama,
        nominal: Number(h.request_saldo || 0),
        tanggal: h.tgl_request,
        keterangan: h.ket_request,
        isVerified: h.is_verifikasi === 1,
        verifikasiSaldo: h.verifikasi_saldo ? Number(h.verifikasi_saldo) : null,
        verifiedBy: h.username_verifikasi,
        verifiedAt: h.tgl_verifikasi,
        statusVerifikasi: h.status_verifikasi,
        ketVerifikasi: h.ket_verifikasi,
        saldoSekarang: Number(h.saldo_sekarang || 0),
      })),
    });
  } catch (error) {
    console.error("Saldo GET error:", error);
    return NextResponse.json({ error: "Gagal mengambil data saldo" }, { status: 500 });
  }
}

// POST: update saldo loket (top-up or deduct)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/saldo", "POST");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const username = (session?.user as { name?: string })?.name || "";

  try {
    const body = await request.json();
    const { loketCode, nominal, keterangan } = body as {
      loketCode: string;
      nominal: number;
      keterangan: string;
    };

    if (!loketCode) {
      return NextResponse.json({ error: "Loket harus dipilih" }, { status: 400 });
    }
    if (!nominal || nominal === 0) {
      return NextResponse.json({ error: "Nominal tidak valid" }, { status: 400 });
    }
    if (!keterangan || keterangan.trim().length === 0) {
      return NextResponse.json({ error: "Keterangan harus diisi" }, { status: 400 });
    }

    // Verify loket exists
    const [loketRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, loket_code, nama, pulsa FROM lokets WHERE loket_code = ? LIMIT 1",
      [loketCode]
    );
    if (loketRows.length === 0) {
      return NextResponse.json({ error: "Loket tidak ditemukan" }, { status: 404 });
    }

    const loket = loketRows[0];
    const saldoSebelum = Number(loket.pulsa || 0);
    const saldoSesudah = saldoSebelum + nominal;

    if (saldoSesudah < 0) {
      return NextResponse.json(
        { error: `Saldo tidak mencukupi. Saldo saat ini: Rp ${saldoSebelum.toLocaleString("id-ID")}` },
        { status: 400 }
      );
    }

    // Generate request code
    const now = new Date();
    const requestCode = `SALDO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Insert saldo request record
    await pool.execute<ResultSetHeader>(
      `INSERT INTO request_saldo 
       (request_code, username, kode_loket, request_saldo, tgl_request, ket_request,
        is_verifikasi, verifikasi_saldo, username_verifikasi, tgl_verifikasi, 
        status_verifikasi, ket_verifikasi, id_bank_tujuan, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), ?, 1, ?, ?, NOW(), 'APPROVED', ?, 0, NOW(), NOW())`,
      [
        requestCode,
        username,
        loketCode,
        nominal,
        keterangan.trim(),
        nominal,
        username,
        `Diproses langsung oleh ${username}`,
      ]
    );

    // Update loket saldo
    await pool.execute(
      "UPDATE lokets SET pulsa = pulsa + ? WHERE loket_code = ?",
      [nominal, loketCode]
    );

    return NextResponse.json({
      success: true,
      message: `Saldo loket ${loket.nama} berhasil ${nominal > 0 ? "ditambahkan" : "dikurangi"} sebesar Rp ${Math.abs(nominal).toLocaleString("id-ID")}`,
      saldoSebelum,
      saldoSesudah,
      requestCode,
    });
  } catch (error) {
    console.error("Saldo POST error:", error);
    return NextResponse.json({ error: "Gagal memproses update saldo" }, { status: 500 });
  }
}
