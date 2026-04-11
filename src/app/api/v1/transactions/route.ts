import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const authToken = await getAuthToken(request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/v1/transactions", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: authToken ? 403 : 401 });

  const isKasir = role === "kasir";
  const kasirLoketCode = isKasir ? (authToken?.loketCode ?? null) : null;

  const { searchParams } = new URL(request.url);
  const page      = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize  = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") || 20)));
  const status    = searchParams.get("status")?.toUpperCase() ?? null;     // SUCCESS | FAILED | PENDING | PARTIAL_SUCCESS
  const provider  = searchParams.get("provider")?.toUpperCase() ?? null;   // LUNASIN | PDAM | all
  const startDate = searchParams.get("startDate") ?? null;                 // YYYY-MM-DD
  const endDate   = searchParams.get("endDate")   ?? null;
  const search    = searchParams.get("search")?.trim() ?? null;            // customer name / id / transaction code

  try {
    // Build WHERE clauses
    const conditions: string[] = ["1=1"];
    const params: (string | number)[] = [];

    if (kasirLoketCode) {
      conditions.push("r.loket_code = ?");
      params.push(kasirLoketCode);
    }

    if (status && status !== "ALL") {
      conditions.push("r.status = ?");
      params.push(status);
    }

    if (startDate && endDate) {
      conditions.push("DATE(r.created_at) BETWEEN ? AND ?");
      params.push(startDate, endDate);
    } else if (startDate) {
      conditions.push("DATE(r.created_at) >= ?");
      params.push(startDate);
    } else if (endDate) {
      conditions.push("DATE(r.created_at) <= ?");
      params.push(endDate);
    }

    // Provider filter: check if any item in the request matches the provider
    if (provider && provider !== "ALL") {
      conditions.push("EXISTS (SELECT 1 FROM multi_payment_items i2 WHERE i2.multi_payment_id = r.id AND i2.provider = ?)");
      params.push(provider);
    }

    // Search: match customer name, customer id, or transaction code inside items
    if (search) {
      const like = `%${search}%`;
      conditions.push(`EXISTS (
        SELECT 1 FROM multi_payment_items i3
        WHERE i3.multi_payment_id = r.id
          AND (i3.customer_name LIKE ? OR i3.customer_id LIKE ? OR i3.transaction_code LIKE ?)
      )`);
      params.push(like, like, like);
    }

    const whereSQL = conditions.join(" AND ");

    // Count total
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM multi_payment_requests r WHERE ${whereSQL}`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;

    // Fetch list with first-item preview (provider, service_type, customer_name)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         r.id,
         r.idempotency_key,
         r.multi_payment_code,
         r.status,
         r.loket_code,
         r.loket_name,
         r.username,
         r.total_items,
         r.total_amount,
         r.total_admin,
         r.grand_total,
         r.paid_at,
         r.created_at,
         r.updated_at,
         r.error_code,
         r.error_message,
         -- preview from first item
         (SELECT i.provider       FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id ASC LIMIT 1) AS preview_provider,
         (SELECT i.service_type   FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id ASC LIMIT 1) AS preview_service_type,
         (SELECT i.customer_name  FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id ASC LIMIT 1) AS preview_customer_name,
         (SELECT i.customer_id    FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id ASC LIMIT 1) AS preview_customer_id,
         (SELECT i.product_code   FROM multi_payment_items i WHERE i.multi_payment_id = r.id ORDER BY i.id ASC LIMIT 1) AS preview_product_code,
         (SELECT COUNT(*)         FROM multi_payment_items i WHERE i.multi_payment_id = r.id AND i.status = 'SUCCESS')  AS success_items,
         (SELECT COUNT(*)         FROM multi_payment_items i WHERE i.multi_payment_id = r.id AND i.status = 'FAILED' )  AS failed_items
       FROM multi_payment_requests r
       WHERE ${whereSQL}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const transactions = rows.map((r) => ({
      id:               r.id,
      idempotencyKey:   r.idempotency_key,
      transactionCode:  r.multi_payment_code,
      status:           r.status,
      loketCode:        r.loket_code,
      loketName:        r.loket_name,
      username:         r.username,
      totalItems:       Number(r.total_items),
      successItems:     Number(r.success_items ?? 0),
      failedItems:      Number(r.failed_items  ?? 0),
      totalAmount:      Number(r.total_amount),
      totalAdmin:       Number(r.total_admin),
      grandTotal:       Number(r.grand_total),
      paidAt:           r.paid_at   ?? null,
      createdAt:        r.created_at,
      updatedAt:        r.updated_at,
      errorCode:        r.error_code    ?? null,
      errorMessage:     r.error_message ?? null,
      preview: {
        provider:      r.preview_provider      ?? null,
        serviceType:   r.preview_service_type  ?? null,
        customerName:  r.preview_customer_name ?? null,
        customerId:    r.preview_customer_id   ?? null,
        productCode:   r.preview_product_code  ?? null,
      },
    }));

    return NextResponse.json({
      transactions,
      pagination: {
        page:       currentPage,
        pageSize,
        totalItems,
        totalPages,
        hasNext:    currentPage < totalPages,
        hasPrev:    currentPage > 1,
      },
    });
  } catch (error) {
    console.error("v1/transactions list error:", error);
    return NextResponse.json({ error: "Gagal mengambil daftar transaksi" }, { status: 500 });
  }
}
