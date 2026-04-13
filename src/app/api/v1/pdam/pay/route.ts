/**
 * Provider API: PDAM Payment
 * POST /api/v1/pdam/pay
 * 
 * Headers: X-API-Key, X-Timestamp, X-Signature, X-Idempotency-Key
 * Body: { "cust_id": "...", "amount": number, "provider_ref": "..." }
 */

import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateProvider, ProviderAuthError, type ProviderInfo } from "@/lib/provider-auth";
import { checkProviderRateLimit } from "@/lib/provider-rate-limit";
import { pdamInquiry, pdamPaymentWithRetry, generateTransactionCode, parsePdamNumber, PdamApiError } from "@/lib/pdam-api";
import { logTransactionEventFireAndForget } from "@/lib/transaction-events";
import { fireWebhook } from "@/lib/provider-webhook";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

export async function POST(request: Request) {
  const startTime = Date.now();
  let body = "";

  try {
    body = await request.text();

    // 1. Authenticate
    const { provider, clientIp } = await authenticateProvider(request, body);

    // 2. Rate limit
    const rateResult = checkProviderRateLimit(
      provider.id,
      provider.rate_limit_per_minute,
      provider.rate_limit_per_day
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error_code: "RATE_LIMITED",
          message: `Rate limit exceeded (${rateResult.limitType}). Retry after ${Math.ceil(rateResult.retryAfterMs / 1000)}s`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        }
      );
    }

    // 3. Parse body
    let parsed: { cust_id?: string; amount?: number; provider_ref?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { success: false, error_code: "INVALID_BODY", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const custId = parsed.cust_id?.trim();
    if (!custId || !/^\d{6,15}$/.test(custId)) {
      return NextResponse.json(
        { success: false, error_code: "INVALID_CUST_ID", message: "cust_id harus 6-15 digit angka" },
        { status: 400 }
      );
    }

    const idempotencyKey = request.headers.get("x-idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      return NextResponse.json(
        { success: false, error_code: "MISSING_IDEMPOTENCY_KEY", message: "Header X-Idempotency-Key required (8-100 chars)" },
        { status: 400 }
      );
    }

    // 4. Idempotency check — return existing result if already processed
    const [existingRows] = await pool.execute(
      `SELECT id, status, response_payload, transaction_code, amount, admin_fee, total, error_code, error_message
       FROM provider_transactions 
       WHERE provider_id = ? AND idempotency_key = ?`,
      [provider.id, idempotencyKey]
    );
    const existing = (existingRows as RowDataPacket[])[0];

    if (existing) {
      if (existing.status === "PENDING") {
        return NextResponse.json(
          { success: false, error_code: "PAYMENT_IN_PROGRESS", message: "Payment sedang diproses" },
          { status: 409 }
        );
      }
      // Return cached result
      const cachedResponse = existing.response_payload
        ? (typeof existing.response_payload === "string" ? JSON.parse(existing.response_payload) : existing.response_payload)
        : null;
      return NextResponse.json({
        success: existing.status === "SUCCESS",
        idempotent: true,
        data: cachedResponse,
        error_code: existing.error_code || undefined,
        error_message: existing.error_message || undefined,
      });
    }

    // 5. Check loket balance (provider uses linked loket's pulsa)
    if (!provider.loket_id) {
      return NextResponse.json(
        { success: false, error_code: "NO_LOKET", message: "Provider belum dikaitkan dengan loket" },
        { status: 400 }
      );
    }
    const [balRows] = await pool.execute(
      `SELECT pulsa FROM lokets WHERE id = ? FOR UPDATE`,
      [provider.loket_id]
    );
    const currentBalance = Number((balRows as RowDataPacket[])[0]?.pulsa ?? 0);

    // Inquiry to get actual amount
    const inquiryResult = await pdamInquiry(custId);
    const totalAmount = inquiryResult.items.reduce((sum, item) => sum + parsePdamNumber(item.total), 0);
    const adminFee = provider.admin_fee;
    const grandTotal = totalAmount + adminFee;

    // Validate amount if provided
    if (parsed.amount !== undefined && Math.abs(parsed.amount - grandTotal) > 1) {
      return NextResponse.json(
        {
          success: false,
          error_code: "AMOUNT_MISMATCH",
          message: `Amount mismatch. Expected: ${grandTotal}, got: ${parsed.amount}. Do inquiry first.`,
        },
        { status: 400 }
      );
    }

    if (currentBalance < grandTotal) {
      return NextResponse.json(
        {
          success: false,
          error_code: "INSUFFICIENT_BALANCE",
          message: `Saldo provider tidak mencukupi. Sisa: ${currentBalance}, dibutuhkan: ${grandTotal}`,
        },
        { status: 402 }
      );
    }

    // 6. Insert PENDING transaction
    const transactionCode = generateTransactionCode();
    const [insertResult] = await pool.execute(
      `INSERT INTO provider_transactions 
        (provider_id, provider_code, provider_ref, idempotency_key, transaction_type, cust_id,
         status, request_payload, amount, admin_fee, total, transaction_code, ip_address, webhook_status)
       VALUES (?, ?, ?, ?, 'payment', ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)`,
      [
        provider.id,
        provider.code,
        parsed.provider_ref || null,
        idempotencyKey,
        custId,
        body,
        totalAmount,
        adminFee,
        grandTotal,
        transactionCode,
        clientIp,
        provider.webhook_url ? "pending" : "not_required",
      ]
    );
    const transactionId = (insertResult as ResultSetHeader).insertId;

    // 7. Process payment via PDAM
    try {
      const payResult = await pdamPaymentWithRetry({
        idpel: custId,
        totalBayar: totalAmount,
        transactionCode,
        loketCode: provider.loket_code || `API-${provider.code}`,
        username: provider.username || `provider:${provider.code}`,
      });

      const durationMs = Date.now() - startTime;

      // Build response data
      const responseData = {
        transaction_code: transactionCode,
        cust_id: custId,
        nama: inquiryResult.items[0]?.nama || "",
        alamat: inquiryResult.items[0]?.alamat || "",
        jumlah_tagihan: inquiryResult.items.length,
        amount: totalAmount,
        admin_fee: adminFee,
        grand_total: grandTotal,
        status: "SUCCESS",
        paid_at: new Date().toISOString(),
        bills: inquiryResult.items.map((item) => ({
          periode: item.thbln,
          subtotal: parsePdamNumber(item.sub_tot),
          total: parsePdamNumber(item.total),
        })),
      };

      // 8. Update transaction to SUCCESS + deduct balance
      await pool.execute(
        `UPDATE provider_transactions 
         SET status = 'SUCCESS', response_payload = ?, duration_ms = ?, updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(responseData), durationMs, transactionId]
      );

      await pool.execute(
        `UPDATE lokets SET pulsa = pulsa - ? WHERE id = ?`,
        [grandTotal, provider.loket_id]
      );

      // 9. Record in multi_payment_items for internal tracking
      recordInternalTransaction(provider, custId, inquiryResult.items, totalAmount, transactionCode, payResult.data);

      // 10. Fire webhook
      sendWebhookIfConfigured(provider, transactionId, {
        event: "payment.success",
        idempotency_key: idempotencyKey,
        provider_ref: parsed.provider_ref || null,
        transaction_code: transactionCode,
        cust_id: custId,
        amount: totalAmount,
        admin_fee: adminFee,
        total: grandTotal,
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
      });

      logTransactionEventFireAndForget({
        idempotencyKey,
        transactionCode,
        provider: `PROVIDER:${provider.code}`,
        eventType: "PROVIDER_PAYMENT_SUCCESS",
        custId,
        message: `Provider ${provider.code} payment SUCCESS: ${grandTotal}`,
      });

      return NextResponse.json({
        success: true,
        data: responseData,
        duration_ms: durationMs,
      });
    } catch (payError) {
      const durationMs = Date.now() - startTime;
      const errorCode = payError instanceof PdamApiError ? payError.code : "PAYMENT_FAILED";
      const errorMessage = payError instanceof Error ? payError.message : "Pembayaran gagal";

      // Update transaction to FAILED
      await pool.execute(
        `UPDATE provider_transactions
         SET status = 'FAILED', error_code = ?, error_message = ?, duration_ms = ?, updated_at = NOW()
         WHERE id = ?`,
        [errorCode, errorMessage, durationMs, transactionId]
      );

      // Fire failure webhook
      sendWebhookIfConfigured(provider, transactionId, {
        event: "payment.failed",
        idempotency_key: idempotencyKey,
        provider_ref: parsed.provider_ref || null,
        transaction_code: transactionCode,
        cust_id: custId,
        amount: totalAmount,
        admin_fee: adminFee,
        total: grandTotal,
        status: "FAILED",
        error_code: errorCode,
        error_message: errorMessage,
        timestamp: new Date().toISOString(),
      });

      logTransactionEventFireAndForget({
        idempotencyKey,
        transactionCode,
        provider: `PROVIDER:${provider.code}`,
        eventType: "PROVIDER_PAYMENT_FAILED",
        providerErrorCode: errorCode,
        custId,
        message: errorMessage,
        severity: "ERROR",
      });

      const status = payError instanceof PdamApiError && payError.code === "NETWORK_TIMEOUT" ? 504 : 422;
      return NextResponse.json(
        {
          success: false,
          error_code: errorCode,
          message: errorMessage,
          transaction_code: transactionCode,
          duration_ms: durationMs,
        },
        { status }
      );
    }
  } catch (error) {
    if (error instanceof ProviderAuthError) {
      return NextResponse.json(
        { success: false, error_code: error.errorCode, message: error.message },
        { status: error.statusCode }
      );
    }

    if (error instanceof PdamApiError) {
      const status = error.code === "NETWORK_TIMEOUT" ? 504 : error.code.startsWith("PDAM_") ? 422 : 502;
      return NextResponse.json(
        { success: false, error_code: error.code, message: error.message },
        { status }
      );
    }

    logTransactionEventFireAndForget({
      provider: "PROVIDER_API",
      eventType: "PROVIDER_PAYMENT_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      severity: "ERROR",
    });

    return NextResponse.json(
      { success: false, error_code: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Record transaction in multi_payment_requests + multi_payment_items for unified reporting
 */
function recordInternalTransaction(
  provider: ProviderInfo,
  custId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  totalAmount: number,
  transactionCode: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paymentItems?: any[]
): void {
  const loketCode = provider.loket_code || `API-${provider.code}`;
  const loketName = provider.loket_name || loketCode;
  const username = provider.username || `provider:${provider.code}`;
  const adminFee = provider.admin_fee;
  const grandTotal = totalAmount + adminFee;
  const multiPaymentCode = `PROV-${provider.code}-${transactionCode}`;
  const idempotencyKey = `prov-${provider.code}-${transactionCode}`;
  const totalItems = items.length;

  (async () => {
    try {
      // 1. Create parent request
      const [parentResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO multi_payment_requests
          (multi_payment_code, idempotency_key, status, loket_code, loket_name, username,
           total_items, total_amount, total_admin, grand_total, paid_amount, change_amount, paid_at)
         VALUES (?, ?, 'SUCCESS', ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
        [multiPaymentCode, idempotencyKey, loketCode, loketName, username,
         totalItems, totalAmount, adminFee, grandTotal, grandTotal]
      );
      const parentId = parentResult.insertId;

      // Build lookup map from payment response (authoritative data after payment)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payItemByBlth = new Map<string, any>();
      if (paymentItems) {
        for (const pi of paymentItems) {
          if (pi.thbln) payItemByBlth.set(pi.thbln, pi);
        }
      }

      // 2. Create item per bill period
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        // Prefer authoritative payment response data over inquiry data
        const resp = payItemByBlth.get(item.thbln) ?? item;
        const subTotal = parsePdamNumber(resp.sub_tot ?? item.sub_tot);
        const itemTotal = parsePdamNumber(resp.total ?? item.total);
        // Admin fee is a flat provider charge — apply to first item only so SUM = adminFee
        const itemAdminFee = idx === 0 ? adminFee : 0;
        const itemGrandTotal = itemTotal + itemAdminFee;
        const metadata = {
          alamat: resp.alamat || item.alamat || "",
          idgol: resp.gol || item.gol || "",
          harga_air: parsePdamNumber(resp.harga ?? item.harga),
          abodemen: 0,
          materai: parsePdamNumber(resp.materai ?? item.materai),
          limbah: parsePdamNumber(resp.limbah ?? item.limbah),
          retribusi: parsePdamNumber(resp.retribusi ?? item.retribusi),
          denda: parsePdamNumber(resp.denda ?? item.denda),
          stand_lalu: resp.stand_l || item.stand_l || "0",
          stand_kini: resp.stand_i || item.stand_i || "0",
          beban_tetap: parsePdamNumber(resp.biaya_tetap ?? item.biaya_tetap),
          biaya_meter: parsePdamNumber(resp.biaya_meter ?? item.biaya_meter),
          diskon: parsePdamNumber(resp.diskon ?? item.diskon),
          jenis_loket: "API_PROVIDER",
          source: `provider:${provider.code}`,
        };

        await pool.execute(
          `INSERT INTO multi_payment_items
            (multi_payment_id, item_code, provider, service_type, customer_id, customer_name,
             product_code, period_label, amount, admin_fee, total, status, transaction_code,
             provider_response, metadata_json, paid_at)
           VALUES (?, ?, 'PDAM', 'PDAM_NATIVE', ?, ?, 'pdam', ?, ?, ?, ?, 'SUCCESS', ?, ?, ?, NOW())`,
          [parentId, `PROV-${custId}-${resp.thbln || item.thbln || Date.now()}`,
           custId, resp.nama || item.nama || "", resp.thbln || item.thbln || "",
           subTotal, itemAdminFee, itemGrandTotal, transactionCode,
           paymentItems ? JSON.stringify(resp) : null,
           JSON.stringify(metadata)]
        );
      }
    } catch (err) {
      console.error("recordInternalTransaction error:", err);
    }
  })();
}

/**
 * Fire webhook if provider has configured a webhook URL 
 */
function sendWebhookIfConfigured(
  provider: ProviderInfo,
  transactionId: number | bigint,
  payload: Parameters<typeof fireWebhook>[4]
): void {
  if (provider.webhook_url) {
    fireWebhook(pool, transactionId, provider.webhook_url, provider.webhook_secret, payload);
  }
}
