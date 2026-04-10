import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canProcessPayment } from "@/lib/rbac";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface MultiPaymentRequestRow extends RowDataPacket {
  id: number;
  multi_payment_code: string;
  idempotency_key: string;
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
  error_code: string | null;
  error_message: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MultiPaymentItemRow extends RowDataPacket {
  id: number;
  item_code: string;
  provider: string;
  service_type: string;
  customer_id: string;
  customer_name: string | null;
  product_code: string | null;
  provider_ref: string | null;
  period_label: string | null;
  amount: number;
  admin_fee: number;
  total: number;
  status: string;
  transaction_code: string | null;
  provider_error_code: string | null;
  provider_error_message: string | null;
  provider_response: string | null;
  metadata_json?: string | null;
  retry_count: number;
  advice_attempts: number;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canProcessPayment(token.role as string)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk pembayaran" }, { status: 403 });
  }

  const { code } = await params;

  try {
    const [requestRows] = await pool.query<MultiPaymentRequestRow[]>(
      `SELECT id, multi_payment_code, idempotency_key, status,
              loket_code, loket_name, username,
              total_items, total_amount, total_admin, grand_total,
              paid_amount, change_amount, error_code, error_message,
              paid_at, created_at, updated_at
         FROM multi_payment_requests
        WHERE multi_payment_code = ?
        LIMIT 1`,
      [code]
    );

    const requestRow = requestRows[0];
    if (!requestRow) {
      return NextResponse.json({ error: "Data multipay tidak ditemukan" }, { status: 404 });
    }

    const [itemRows] = await pool.query<MultiPaymentItemRow[]>(
      `SELECT id, item_code, provider, service_type, customer_id, customer_name,
              product_code, provider_ref, period_label, amount, admin_fee, total,
              status, transaction_code, provider_error_code, provider_error_message,
              CAST(provider_response AS CHAR) AS provider_response,
              retry_count, advice_attempts, paid_at, failed_at, created_at, updated_at
         FROM multi_payment_items
        WHERE multi_payment_id = ?
        ORDER BY id ASC`,
      [requestRow.id]
    );

    return NextResponse.json({
      multiPayment: {
        multiPaymentCode: requestRow.multi_payment_code,
        idempotencyKey: requestRow.idempotency_key,
        status: requestRow.status,
        loketCode: requestRow.loket_code,
        loketName: requestRow.loket_name,
        username: requestRow.username,
        totalItems: Number(requestRow.total_items || 0),
        totalAmount: Number(requestRow.total_amount || 0),
        totalAdmin: Number(requestRow.total_admin || 0),
        grandTotal: Number(requestRow.grand_total || 0),
        paidAmount: Number(requestRow.paid_amount || 0),
        changeAmount: Number(requestRow.change_amount || 0),
        errorCode: requestRow.error_code,
        errorMessage: requestRow.error_message,
        paidAt: requestRow.paid_at,
        createdAt: requestRow.created_at,
        updatedAt: requestRow.updated_at,
      },
      items: itemRows.map((row) => ({
        itemCode: row.item_code,
        provider: row.provider,
        serviceType: row.service_type,
        customerId: row.customer_id,
        customerName: row.customer_name,
        productCode: row.product_code,
        providerRef: row.provider_ref,
        periodLabel: row.period_label,
        amount: Number(row.amount || 0),
        adminFee: Number(row.admin_fee || 0),
        total: Number(row.total || 0),
        status: row.status,
        transactionCode: row.transaction_code,
        providerErrorCode: row.provider_error_code,
        providerErrorMessage: row.provider_error_message,
        providerResponse: row.provider_response ? JSON.parse(row.provider_response) : null,
        retryCount: Number(row.retry_count || 0),
        adviceAttempts: Number(row.advice_attempts || 0),
        paidAt: row.paid_at,
        failedAt: row.failed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal mengambil detail multipay";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canProcessPayment(token.role as string)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk pembayaran" }, { status: 403 });
  }

  const { code } = await params;
  const body = await req.json();
  const { itemCode, action } = body as { itemCode?: string; action?: string };

  if (!itemCode || action !== "run_advice") {
    return NextResponse.json({ error: "Aksi multipay item tidak valid" }, { status: 400 });
  }

  try {
    const [requestRows] = await pool.query<MultiPaymentRequestRow[]>(
      `SELECT id, multi_payment_code, idempotency_key, status,
              loket_code, loket_name, username,
              total_items, total_amount, total_admin, grand_total,
              paid_amount, change_amount, error_code, error_message,
              paid_at, created_at, updated_at
         FROM multi_payment_requests
        WHERE multi_payment_code = ?
        LIMIT 1`,
      [code]
    );

    const requestRow = requestRows[0];
    if (!requestRow) {
      return NextResponse.json({ error: "Data multipay tidak ditemukan" }, { status: 404 });
    }

    const [itemRows] = await pool.query<MultiPaymentItemRow[]>(
      `SELECT id, item_code, provider, service_type, customer_id, customer_name,
              product_code, provider_ref, period_label, amount, admin_fee, total,
              status, transaction_code, provider_error_code, provider_error_message,
              CAST(provider_response AS CHAR) AS provider_response,
              CAST(metadata_json AS CHAR) AS metadata_json,
              retry_count, advice_attempts, paid_at, failed_at, created_at, updated_at
         FROM multi_payment_items
        WHERE multi_payment_id = ? AND item_code = ?
        LIMIT 1`,
      [requestRow.id, itemCode]
    );

    const itemRow = itemRows[0];
    if (!itemRow) {
      return NextResponse.json({ error: "Item multipay tidak ditemukan" }, { status: 404 });
    }

    if (itemRow.provider !== "LUNASIN") {
      return NextResponse.json({ error: "Aksi advice hanya didukung untuk item Lunasin" }, { status: 400 });
    }

    const metadata = itemRow.metadata_json ? JSON.parse(itemRow.metadata_json) as Record<string, unknown> : {};
    const cookieHeader = req.headers.get("cookie") || "";

    const adviceRes = await fetch(`${req.nextUrl.origin}/api/pembayaran/lunasin/advice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        transactionCode: itemRow.transaction_code,
        idpel: itemRow.customer_id,
        kodeProduk: itemRow.product_code,
        idTrx: itemRow.provider_ref,
        input2: String(metadata.input2 || ""),
        input3: String(metadata.input3 || ""),
      }),
    });

    const adviceData = await adviceRes.json();
    if (!adviceRes.ok) {
      return NextResponse.json({ error: adviceData.error || "Gagal menjalankan advice" }, { status: adviceRes.status });
    }

    // Advice route already updated multi_payment_items and parent — re-read latest status
    const [updatedItemRows] = await pool.query<RowDataPacket[]>(
      `SELECT status, provider_error_code, provider_error_message,
              CAST(provider_response AS CHAR) AS provider_response,
              advice_attempts, paid_at, failed_at
         FROM multi_payment_items
        WHERE id = ?
        LIMIT 1`,
      [itemRow.id]
    );

    const updatedItem = updatedItemRows[0];
    const nextStatus = updatedItem?.status || "PENDING_ADVICE";

    const [parentRows] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM multi_payment_requests WHERE id = ? LIMIT 1`,
      [requestRow.id]
    );
    const parentStatus = parentRows[0]?.status || "PENDING";

    return NextResponse.json({
      success: true,
      message: adviceData.success
        ? "Advice berhasil dijalankan"
        : adviceData.pending
          ? "Advice dijalankan, transaksi masih pending"
          : "Advice selesai diproses",
      itemCode,
      itemStatus: nextStatus,
      parentStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memproses aksi item multipay";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}