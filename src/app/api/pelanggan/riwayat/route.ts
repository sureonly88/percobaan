import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

// GET: Riwayat tagihan per pelanggan
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const idPelanggan = searchParams.get("idPelanggan");
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const status = (searchParams.get("status") || "semua").toLowerCase();

  if (!idPelanggan) {
    return NextResponse.json({ error: "idPelanggan wajib diisi" }, { status: 400 });
  }

  try {
    const txDate = "COALESCE(i.paid_at, i.created_at)";
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

    let where = "WHERE i.customer_id = ?";
    const params: (string | number)[] = [idPelanggan];

    if (startDate) {
      where += ` AND ${txDate} >= ?`;
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      where += ` AND ${txDate} <= ?`;
      params.push(`${endDate} 23:59:59`);
    }

    if (status !== "semua") {
      if (status === "lunas" || status === "success") {
        where += " AND i.status = 'SUCCESS'";
      } else if (status === "gagal" || status === "failed") {
        where += " AND i.status = 'FAILED'";
      } else if (status === "pending") {
        where += " AND i.status = 'PENDING'";
      }
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT i.id, ${kategoriCase} as jenis,
              i.transaction_code as transactionCode,
              i.customer_id as idPelanggan,
              i.customer_name as nama,
              i.period_label as periode,
              i.product_code as kodeProduk,
              i.amount as tagihan,
              i.admin_fee as admin,
              i.total,
              r.loket_name as loketName,
              r.loket_code as loketCode,
              r.username,
              ${txDate} as tanggal,
              i.status,
              i.status as processingStatus,
              i.provider_error_code as providerErrorCode,
              i.provider_error_message as providerErrorMessage,
              i.paid_at as paidAt,
              i.failed_at as failedAt,
              (
                SELECT te.idempotency_key
                FROM transaction_events te
                WHERE te.transaction_code = i.transaction_code COLLATE utf8mb4_general_ci
                  AND te.idempotency_key IS NOT NULL
                ORDER BY te.created_at DESC, te.id DESC
                LIMIT 1
              ) as monitoringIdempotencyKey
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       ${where}
       ORDER BY ${txDate} DESC`,
      params
    );

    const combined = rows.map((r) => ({
      id: r.id,
      jenis: r.jenis,
      transactionCode: r.transactionCode ?? null,
      idPelanggan: r.idPelanggan ?? "-",
      nama: r.nama ?? "-",
      periode: r.periode ?? "-",
      tagihan: Number(r.tagihan ?? 0),
      admin: Number(r.admin ?? 0),
      total: Number(r.total ?? 0),
      loketName: r.loketName ?? "-",
      loketCode: r.loketCode ?? "-",
      username: r.username ?? "-",
      tanggal: r.tanggal,
      status: r.status ?? "-",
      flagTransaksi: r.status ?? "-",
      processingStatus: r.processingStatus ?? null,
      providerErrorCode: r.providerErrorCode ?? null,
      providerErrorMessage: r.providerErrorMessage ?? null,
      paidAt: r.paidAt ?? null,
      failedAt: r.failedAt ?? null,
      monitoringIdempotencyKey: r.monitoringIdempotencyKey ?? null,
    }));

    // Summary
    const pdamRows = rows.filter((r) => r.jenis === "PDAM");
    const plnRows = rows.filter((r) => r.jenis !== "PDAM");
    const totalPdam = pdamRows.reduce((a, r) => a + Number(r.total ?? 0), 0);
    const totalPln = plnRows.reduce((a, r) => a + Number(r.total ?? 0), 0);

    return NextResponse.json({
      riwayat: combined,
      summary: {
        totalTransaksi: combined.length,
        pdamCount: pdamRows.length,
        plnCount: plnRows.length,
        totalNominal: totalPdam + totalPln,
        totalPdam,
        totalPln,
      },
    });
  } catch (error) {
    console.error("Riwayat Pelanggan Error:", error);
    return NextResponse.json({ error: "Gagal mengambil riwayat" }, { status: 500 });
  }
}
