import { NextRequest, NextResponse } from "next/server";
import { canProcessPayment, normalizeRole } from "@/lib/rbac";
import { orchestrateMultiPayment } from "@/lib/multipay/orchestrator";
import { MultiPaymentProgressEvent, MultiPaymentRequestInput } from "@/lib/multipay/types";
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
  first_customer_id: string | null;
  first_customer_name: string | null;
  first_service_type: string | null;
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

    // Kasir hanya boleh melihat transaksi loketnya sendiri (admin & supervisor: semua loket)
    if (normalizeRole(auth.token.role) === "kasir") {
      if (!auth.token.loketCode) {
        return NextResponse.json({ error: "Akun belum terhubung ke loket" }, { status: 403 });
      }
      whereClauses.push("multi_payment_requests.loket_code = ?");
      params.push(auth.token.loketCode);
    }

    // status boleh satu nilai atau daftar dipisah koma (mis. PENDING,PENDING_REVIEW)
    const statuses = status === "ALL" ? [] : status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      whereClauses.push(`multi_payment_requests.status IN (${statuses.map(() => "?").join(",")})`);
      params.push(...statuses);
    }

    if (search) {
      whereClauses.push(`(multi_payment_requests.multi_payment_code LIKE ? OR COALESCE(multi_payment_requests.username, '') LIKE ? OR COALESCE(multi_payment_requests.loket_code, '') LIKE ? OR COALESCE(multi_payment_requests.loket_name, '') LIKE ?
        OR EXISTS (SELECT 1 FROM multi_payment_items si
                    WHERE si.multi_payment_id = multi_payment_requests.id
                      AND (si.customer_id LIKE ? OR COALESCE(si.customer_name, '') LIKE ? OR COALESCE(si.transaction_code, '') LIKE ?)))`);
      const searchValue = `%${search}%`;
      params.push(searchValue, searchValue, searchValue, searchValue, searchValue, searchValue, searchValue);
    }

    if (startDate) {
      whereClauses.push("DATE(multi_payment_requests.created_at) >= ?");
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push("DATE(multi_payment_requests.created_at) <= ?");
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
      `SELECT multi_payment_requests.multi_payment_code, multi_payment_requests.status, multi_payment_requests.loket_code, multi_payment_requests.loket_name, multi_payment_requests.username,
              multi_payment_requests.total_items, multi_payment_requests.total_amount, multi_payment_requests.total_admin, multi_payment_requests.grand_total,
              multi_payment_requests.paid_amount, multi_payment_requests.change_amount, multi_payment_requests.paid_at, multi_payment_requests.created_at,
              fi.customer_id AS first_customer_id, fi.customer_name AS first_customer_name,
              fi.service_type AS first_service_type
         FROM multi_payment_requests
         LEFT JOIN multi_payment_items fi ON fi.id = (
           SELECT MIN(x.id) FROM multi_payment_items x WHERE x.multi_payment_id = multi_payment_requests.id
         )
         ${whereSql}
        ORDER BY multi_payment_requests.created_at DESC
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
        firstCustomerId: row.first_customer_id,
        firstCustomerName: row.first_customer_name,
        firstServiceType: row.first_service_type,
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
  // Forward Authorization header so Bearer-token (mobile) callers can reach internal routes.
  const authorizationHeader = req.headers.get("authorization") || undefined;

  const wantsStream = req.nextUrl.searchParams.get("stream") === "1";

  if (wantsStream) {
    // SSE mode: stream progress events to the client, with final `done` event
    // carrying the same MultiPaymentResponse JSON as the non-stream path.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const safeEnqueue = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // Controller already closed (client disconnected); ignore.
          }
        };
        const sendEvent = (event: MultiPaymentProgressEvent) => {
          safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
        };

        // Keepalive comment every 15s so reverse proxies don't time out.
        const keepalive = setInterval(() => safeEnqueue(`: keepalive\n\n`), 15_000);

        try {
          await assertCashierCanProcessPayment({ username, loketCode: body.loketCode });
          await orchestrateMultiPayment(
            { ...body, username },
            { baseUrl, cookieHeader, authorizationHeader, onProgress: sendEvent },
          );
        } catch (error: unknown) {
          const status = error instanceof CashierClosingError ? error.status : 500;
          const message = error instanceof Error ? error.message : "Gagal memproses multipay";
          sendEvent({ type: "error", message: `[${status}] ${message}` });
        } finally {
          clearInterval(keepalive);
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed; ignore.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    await assertCashierCanProcessPayment({ username, loketCode: body.loketCode });
    const result = await orchestrateMultiPayment({
      ...body,
      username,
    }, {
      baseUrl,
      cookieHeader,
      authorizationHeader,
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