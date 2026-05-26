import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

// GET /api/laporan/setoran-harian?date=YYYY-MM-DD&loketCode=XXX
// Mengembalikan rekap setoran harian 1 loket (agregat semua kasir/shift)
// + rincian per kasir + breakdown per provider.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionRole = (session.user as { role?: string })?.role || "";
  const sessionLoketCode = (session.user as { loketCode?: string })?.loketCode || "";
  const canSeeAll = sessionRole === "admin" || sessionRole === "supervisor";

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || "";
  const requestedLoket = searchParams.get("loketCode") || "";
  const loketCode = canSeeAll ? (requestedLoket || sessionLoketCode) : sessionLoketCode;

  if (!date) {
    return NextResponse.json({ error: "Parameter 'date' wajib (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!loketCode) {
    return NextResponse.json({ error: "Parameter 'loketCode' wajib" }, { status: 400 });
  }

  try {
    const dayStart = `${date} 00:00:00`;
    const dayEnd = `${date} 23:59:59`;

    // Loket info
    const [loketRows] = await pool.query<RowDataPacket[]>(
      "SELECT loket_code, nama, alamat FROM lokets WHERE loket_code = ? LIMIT 1",
      [loketCode]
    );
    const loket = loketRows[0] || null;
    if (!loket) {
      return NextResponse.json({ error: "Loket tidak ditemukan" }, { status: 404 });
    }

    // Total agregat
    const [totalRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(DISTINCT r.id) AS requestCount,
         COUNT(i.id) AS itemCount,
         COALESCE(SUM(i.amount), 0) AS totalTagihan,
         COALESCE(SUM(i.admin_fee), 0) AS totalAdmin,
         COALESCE(SUM(i.total), 0) AS totalNominal
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       WHERE i.status = 'SUCCESS'
         AND r.loket_code = ?
         AND COALESCE(i.paid_at, i.created_at) BETWEEN ? AND ?`,
      [loketCode, dayStart, dayEnd]
    );
    const total = totalRows[0] || {};

    // Per kasir
    const [perKasir] = await pool.query<RowDataPacket[]>(
      `SELECT
         r.username,
         COUNT(DISTINCT r.id) AS requestCount,
         COUNT(i.id) AS itemCount,
         COALESCE(SUM(i.amount), 0) AS totalTagihan,
         COALESCE(SUM(i.admin_fee), 0) AS totalAdmin,
         COALESCE(SUM(i.total), 0) AS totalNominal
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       WHERE i.status = 'SUCCESS'
         AND r.loket_code = ?
         AND COALESCE(i.paid_at, i.created_at) BETWEEN ? AND ?
       GROUP BY r.username
       ORDER BY totalNominal DESC`,
      [loketCode, dayStart, dayEnd]
    );

    // Per kategori produk
    const kategoriCase = `
      CASE
        WHEN i.provider = 'PDAM' THEN 'PDAM'
        WHEN i.product_code LIKE 'pln-%' THEN 'PLN'
        WHEN i.product_code LIKE 'bpjs-%' THEN 'BPJS'
        WHEN i.product_code LIKE 'telkom-%' THEN 'Telkom'
        WHEN i.product_code LIKE 'pulsa-%' THEN 'Pulsa'
        WHEN i.product_code LIKE 'paketdata-%' THEN 'Paket Data'
        WHEN i.product_code LIKE 'pdam-%' THEN 'PDAM Lunasin'
        ELSE 'Lainnya'
      END
    `;
    const [perKategori] = await pool.query<RowDataPacket[]>(
      `SELECT ${kategoriCase} AS kategori,
              COUNT(i.id) AS itemCount,
              COALESCE(SUM(i.amount), 0) AS totalTagihan,
              COALESCE(SUM(i.admin_fee), 0) AS totalAdmin,
              COALESCE(SUM(i.total), 0) AS totalNominal
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       WHERE i.status = 'SUCCESS'
         AND r.loket_code = ?
         AND COALESCE(i.paid_at, i.created_at) BETWEEN ? AND ?
       GROUP BY kategori
       ORDER BY totalNominal DESC`,
      [loketCode, dayStart, dayEnd]
    );

    // Setoran kasir (closings) untuk hari + loket ini
    const [closings] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, shift_code AS shiftCode, status,
              opening_cash AS openingCash,
              system_cash_total AS systemCashTotal,
              counted_cash_total AS countedCashTotal,
              retained_cash AS retainedCash,
              deposit_total AS depositTotal,
              received_amount AS receivedAmount,
              discrepancy_amount AS discrepancyAmount,
              submitted_at AS submittedAt,
              received_at AS receivedAt,
              verified_at AS verifiedAt
       FROM cashier_closings
       WHERE loket_code = ? AND business_date = ?
       ORDER BY shift_code, submitted_at`,
      [loketCode, date]
    );

    return NextResponse.json({
      ok: true,
      date,
      loket: {
        loketCode: loket.loket_code,
        nama: loket.nama,
        alamat: loket.alamat,
      },
      summary: {
        requestCount: Number(total.requestCount || 0),
        itemCount: Number(total.itemCount || 0),
        totalTagihan: Number(total.totalTagihan || 0),
        totalAdmin: Number(total.totalAdmin || 0),
        totalNominal: Number(total.totalNominal || 0),
      },
      perKasir: perKasir.map((r) => ({
        username: r.username,
        requestCount: Number(r.requestCount || 0),
        itemCount: Number(r.itemCount || 0),
        totalTagihan: Number(r.totalTagihan || 0),
        totalAdmin: Number(r.totalAdmin || 0),
        totalNominal: Number(r.totalNominal || 0),
      })),
      perKategori: perKategori.map((r) => ({
        kategori: r.kategori,
        itemCount: Number(r.itemCount || 0),
        totalTagihan: Number(r.totalTagihan || 0),
        totalAdmin: Number(r.totalAdmin || 0),
        totalNominal: Number(r.totalNominal || 0),
      })),
      closings: closings.map((c) => ({
        id: c.id,
        username: c.username,
        shiftCode: c.shiftCode,
        status: c.status,
        openingCash: Number(c.openingCash || 0),
        systemCashTotal: Number(c.systemCashTotal || 0),
        countedCashTotal: Number(c.countedCashTotal || 0),
        retainedCash: Number(c.retainedCash || 0),
        depositTotal: Number(c.depositTotal || 0),
        receivedAmount: Number(c.receivedAmount || 0),
        discrepancyAmount: Number(c.discrepancyAmount || 0),
        submittedAt: c.submittedAt,
        receivedAt: c.receivedAt,
        verifiedAt: c.verifiedAt,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[setoran-harian] error:", error);
    return NextResponse.json({ error: "Gagal menyusun setoran harian" }, { status: 500 });
  }
}
