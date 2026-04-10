import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";

// GET: List provider transactions
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  const check = denyIfUnauthorized(role, "/api/provider", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get("provider_id");
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = (page - 1) * limit;

  try {
    let where = "1=1";
    const params: (string | number)[] = [];

    if (providerId) {
      where += " AND pt.provider_id = ?";
      params.push(Number(providerId));
    }
    if (status) {
      where += " AND pt.status = ?";
      params.push(status);
    }
    if (type) {
      where += " AND pt.transaction_type = ?";
      params.push(type);
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM provider_transactions pt WHERE ${where}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT pt.id, pt.provider_id, pt.provider_code, pt.provider_ref, pt.idempotency_key,
              pt.transaction_type, pt.cust_id, pt.status, pt.amount, pt.admin_fee, pt.total,
              pt.error_code, pt.error_message, pt.transaction_code, pt.ip_address,
              pt.duration_ms, pt.webhook_status, pt.webhook_attempts, pt.created_at,
              p.name as provider_name
       FROM provider_transactions pt
       LEFT JOIN api_providers p ON p.id = pt.provider_id
       WHERE ${where}
       ORDER BY pt.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      transactions: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Provider Transactions GET Error:", error);
    return NextResponse.json({ error: "Gagal mengambil data transaksi provider" }, { status: 500 });
  }
}
