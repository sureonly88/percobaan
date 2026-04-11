import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/transactions/summary", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: authToken ? 403 : 401 });

  const isKasir = role === "kasir";
  const kasirLoketCode = isKasir ? (authToken?.loketCode ?? null) : null;

  const loketCondition = kasirLoketCode ? "AND r.loket_code = ?" : "";
  const loketParams: string[] = kasirLoketCode ? [kasirLoketCode] : [];

  try {
    // Current month spending + count
    const [currentRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*)            AS total_trx,
         COALESCE(SUM(r.grand_total), 0) AS total_spending
       FROM multi_payment_requests r
       WHERE r.status = 'SUCCESS'
         AND YEAR(r.created_at)  = YEAR(CURDATE())
         AND MONTH(r.created_at) = MONTH(CURDATE())
         ${loketCondition}`,
      loketParams
    );

    // Per-month history (last 12 months)
    const [monthlyRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         DATE_FORMAT(r.created_at, '%Y-%m') AS month_key,
         COUNT(*)                            AS total_trx,
         COALESCE(SUM(r.grand_total), 0)    AS total_spending
       FROM multi_payment_requests r
       WHERE r.status = 'SUCCESS'
         AND r.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         ${loketCondition}
       GROUP BY month_key
       ORDER BY month_key DESC`,
      loketParams
    );

    return NextResponse.json({
      currentMonth: {
        totalTrx:      Number(currentRows[0]?.total_trx      ?? 0),
        totalSpending: Number(currentRows[0]?.total_spending ?? 0),
      },
      monthly: (monthlyRows as RowDataPacket[]).map(r => ({
        monthKey:      String(r.month_key),
        totalTrx:      Number(r.total_trx),
        totalSpending: Number(r.total_spending),
      })),
    });
  } catch (e) {
    console.error("[summary]", e);
    return NextResponse.json({ error: "Gagal mengambil ringkasan" }, { status: 500 });
  }
}
