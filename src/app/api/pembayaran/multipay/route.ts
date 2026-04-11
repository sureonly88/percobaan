import { NextRequest, NextResponse } from "next/server";
import { canProcessPayment } from "@/lib/rbac";
import { orchestrateMultiPayment } from "@/lib/multipay/orchestrator";
import { MultiPaymentRequestInput } from "@/lib/multipay/types";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { assertCashierCanProcessPayment, CashierClosingError } from "@/lib/cashier-closing";
import { getAuthToken, unauthorized, forbidden } from "@/lib/api-auth";

interface MultiPaymentListRow extends RowDataPacket {
  multi_payment_code: string;
  status: string;
  loket_code: string | null;
  loket_name: string | null;
  username: string | null;
  total_items: number;
  total_amount: number;
  total_admin: number;
  grand_total: number;
  paid_amount: number;
  change_amount: number;
  paid_at: string | null;
  created_at: string;
}

async function authorize(req: NextRequest) {
  const token = await getAuthToken(req);
  if (!token) return { ok: false as const, response: unauthorized() };
  if (!canProcessPayment(token.role)) return { ok: false as const, response: forbidden("Anda tidak memiliki akses untuk pembayaran") };
  return { ok: true as const, token };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  const status = (req.nextUrl.searchParams.get("status") || "ALL").toUpperCase();
  const search = (req.nextUrl.searchParams.get("search") || "").trim();
  const startDate = (req.nextUrl.searchParams.get("startDate") || "").trim();
  const endDate = (req.nextUrl.searchParams.get("endDate") || "").trim();
  const pageParam = Number(req.nextUrl.searchParams.get("page") || 1);
  const pageSizeParam = Number(req.nextUrl.searchParams.get("pageSize") || req.nextUrl.searchParams.get("limit") || 20);
  const page = Number.isFinite(pageParam) ? Math.max(pageParam, 1) : 1;
  const pageSize = Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 1), 100) : 20;
  const offset = (page - 1) * pageSize;

  try {
    const whereClauses: string[] = [];
    const params: Array<string | number> = [];

    if (status !== "ALL") {
      whereClauses.push("status = ?");
      params.push(status);
    }

    if (search) {
      whereClauses.push("(multi_payment_code LIKE ? OR COALESCE(username, '') LIKE ? OR COALESCE(loket_code, '') LIKE ? OR COALESCE(loket_name, '') LIKE ?)");
      const searchValue = `%${search}%`;
      params.push(searchValue, searchValue, searchValue, searchValue);
    }

    if (startDate) {
      whereClauses.push("DATE(created_at) >= ?");
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push("DATE(created_at) <= ?");
      params.push(endDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
         FROM multi_payment_requests
         ${whereSql}`,
      [...params]
    );

    const totalItems = Number(countRows[0]?.total || 0);
    const [rows] = await pool.query<MultiPaymentListRow[]>(
      `SELECT multi_payment_code, status, loket_code, loket_name, username,
              total_items, total_amount, total_admin, grand_total,
              paid_amount, change_amount, paid_at, created_at
         FROM multi_payment_requests
         ${whereSql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return NextResponse.json({
      items: rows.map((row) => ({
        multiPaymentCode: row.multi_payment_code,
        status: row.status,
        loketCode: row.loket_code,
        loketName: row.loket_name,
        username: row.username,
        totalItems: Number(row.total_items || 0),
        totalAmount: Number(row.total_amount || 0),
        totalAdmin: Number(row.total_admin || 0),
        grandTotal: Number(row.grand_total || 0),
        paidAmount: Number(row.paid_amount || 0),
        changeAmount: Number(row.change_amount || 0),
        paidAt: row.paid_at,
        createdAt: row.created_at,
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
        hasPrev: page > 1,
        hasNext: offset + rows.length < totalItems,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal mengambil daftar multipay";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  const { token } = auth;

  const body = (await req.json()) as Omit<MultiPaymentRequestInput, "username">;

  if (!body?.idempotencyKey || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Payload multipay tidak valid" }, { status: 400 });
  }

  if (!body.loketCode || !body.loketName) {
    return NextResponse.json({ error: "Informasi loket wajib diisi" }, { status: 400 });
  }

  const username = token.username || token.name || "";
  // Gunakan http://localhost:PORT untuk internal call agar selalu bisa resolve
  // di dalam Docker container, terlepas dari domain publik yang diakses client.
  const internalPort = process.env.PORT || "3000";
  const baseUrl = `http://localhost:${internalPort}`;
  const cookieHeader = req.headers.get("cookie") || undefined;

  try {
    await assertCashierCanProcessPayment({ username, loketCode: body.loketCode });
    const result = await orchestrateMultiPayment({
      ...body,
      username,
    }, {
      baseUrl,
      cookieHeader,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof CashierClosingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Gagal memproses multipay";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}