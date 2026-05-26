import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

// GET: List SUCCESS transaction items eligible for receipt reprint.
// Filter: startDate, endDate (wajib salah satu), loketCode, provider, idpel, search.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionRole = (session.user as { role?: string })?.role || "";
  const sessionLoketCode = (session.user as { loketCode?: string })?.loketCode || "";
  const canSeeAll = sessionRole === "admin" || sessionRole === "supervisor";

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const provider = (searchParams.get("provider") || "").toUpperCase();
  const idpel = searchParams.get("idpel") || "";
  const search = searchParams.get("search") || "";
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200));
  const requestedLoket = searchParams.get("loketCode") || "";
  const effectiveLoket = canSeeAll ? requestedLoket : (sessionLoketCode || "__NO_LOKET__");

  try {
    let where = "WHERE i.status = 'SUCCESS'";
    const params: (string | number)[] = [];

    if (startDate) {
      where += " AND COALESCE(i.paid_at, i.created_at) >= ?";
      params.push(startDate + " 00:00:00");
    }
    if (endDate) {
      where += " AND COALESCE(i.paid_at, i.created_at) <= ?";
      params.push(endDate + " 23:59:59");
    }
    if (provider === "PDAM" || provider === "LUNASIN") {
      where += " AND i.provider = ?";
      params.push(provider);
    }
    if (effectiveLoket && effectiveLoket !== "semua" && effectiveLoket !== "") {
      where += " AND r.loket_code = ?";
      params.push(effectiveLoket);
    }
    if (idpel) {
      where += " AND i.customer_id = ?";
      params.push(idpel);
    }
    if (search) {
      where += " AND (i.customer_id LIKE ? OR i.customer_name LIKE ? OR i.transaction_code LIKE ?)";
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         i.id,
         i.transaction_code AS transactionCode,
         i.provider,
         i.product_code AS productCode,
         i.customer_id AS idPelanggan,
         i.customer_name AS nama,
         i.period_label AS periode,
         i.amount AS tagihan,
         i.admin_fee AS admin,
         i.total,
         COALESCE(i.paid_at, i.created_at) AS tanggal,
         r.loket_code AS loketCode,
         COALESCE(NULLIF(l.nama, ''), r.loket_code) AS loketName,
         r.username
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
       LEFT JOIN lokets l ON l.loket_code = r.loket_code
       ${where}
       ORDER BY COALESCE(i.paid_at, i.created_at) DESC
       LIMIT ${limit}`,
      params
    );

    return NextResponse.json({
      ok: true,
      items: rows,
      count: rows.length,
      limit,
    });
  } catch (error) {
    console.error("[cetak-ulang/list] error:", error);
    return NextResponse.json({ error: "Gagal mengambil data" }, { status: 500 });
  }
}
