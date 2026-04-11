import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getAuthToken, unauthorized } from "@/lib/api-auth";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getMidtransClientKey } from "@/lib/midtrans";

/**
 * GET /api/topup
 *
 * Query params:
 *   ?code=TOPUP-...    → single status check (returns 1 record)
 *   ?page=1&pageSize=10 → history list
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthToken(request);
  if (!auth) return unauthorized();
  const check = denyIfUnauthorized(auth.role, "/api/topup", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: 403 });

  const params = request.nextUrl.searchParams;
  const code = params.get("code");

  const isKasir = auth.role === "kasir";
  const loketCode = isKasir ? auth.loketCode : null;

  try {
    // Single status check
    if (code) {
      const conditions = ["gateway_order_id = ?"];
      const queryParams: unknown[] = [code];

      if (loketCode) {
        conditions.push("loket_code = ?");
        queryParams.push(loketCode);
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, request_code, loket_code, username, nominal, fee, total_bayar,
                status, payment_method, gateway_order_id, snap_token, snap_url,
                expires_at, paid_at, created_at
         FROM topup_requests
         WHERE ${conditions.join(" AND ")}
         LIMIT 1`,
        queryParams
      );

      if (rows.length === 0) {
        return NextResponse.json({ error: "Top-up tidak ditemukan" }, { status: 404 });
      }

      const r = rows[0];
      return NextResponse.json({
        requestCode: r.request_code,
        orderId: r.gateway_order_id,
        loketCode: r.loket_code,
        username: r.username,
        nominal: Number(r.nominal),
        fee: Number(r.fee),
        totalBayar: Number(r.total_bayar),
        status: r.status,
        paymentMethod: r.payment_method,
        snapToken: r.snap_token,
        snapUrl: r.snap_url,
        expiresAt: r.expires_at,
        paidAt: r.paid_at,
        createdAt: r.created_at,
        midtransClientKey: getMidtransClientKey(),
      });
    }

    // History list
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(50, Math.max(5, Number(params.get("pageSize")) || 10));
    const offset = (page - 1) * pageSize;

    const conditions = ["1=1"];
    const queryParams: unknown[] = [];

    if (loketCode) {
      conditions.push("loket_code = ?");
      queryParams.push(loketCode);
    }

    const filterLoket = params.get("loketCode");
    if (filterLoket && !loketCode) {
      conditions.push("loket_code = ?");
      queryParams.push(filterLoket);
    }

    const where = conditions.join(" AND ");

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM topup_requests WHERE ${where}`,
      queryParams
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, request_code, loket_code, username, nominal, fee, total_bayar,
              status, payment_method, gateway_order_id, paid_at, created_at
       FROM topup_requests
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    );

    return NextResponse.json({
      topups: (rows as RowDataPacket[]).map(r => ({
        requestCode: r.request_code,
        orderId: r.gateway_order_id,
        loketCode: r.loket_code,
        username: r.username,
        nominal: Number(r.nominal),
        fee: Number(r.fee),
        totalBayar: Number(r.total_bayar),
        status: r.status,
        paymentMethod: r.payment_method,
        paidAt: r.paid_at,
        createdAt: r.created_at,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
      },
    });
  } catch (error) {
    console.error("[topup GET]", error);
    return NextResponse.json({ error: "Gagal memuat data top-up" }, { status: 500 });
  }
}
