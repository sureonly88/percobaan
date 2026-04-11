import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { denyIfUnauthorized } from "@/lib/rbac";
import { getAuthToken } from "@/lib/api-auth";

function categorizeError(errorCode: string | null, lastEventType: string | null): string {
  if (errorCode === "MANUALLY_RESOLVED" || lastEventType === "PAYMENT_MANUALLY_RESOLVED") {
    return "MANUAL";
  }
  if (errorCode?.startsWith("DB_") || lastEventType?.includes("DB_")) {
    return "DB";
  }
  if (errorCode?.startsWith("NETWORK_")) {
    return "NETWORK";
  }
  if (
    errorCode?.startsWith("PDAM_") ||
    errorCode?.startsWith("LUNASIN_") ||
    errorCode?.startsWith("HTTP_") ||
    /^\d{4}$/.test(errorCode || "")
  ) {
    return "PROVIDER";
  }
  if (lastEventType?.includes("PROVIDER") || lastEventType?.startsWith("ADVICE_")) {
    return "PROVIDER";
  }
  return errorCode ? "APPLICATION" : "-";
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { idempotencyKey: string } }
) {
  const authToken = await getAuthToken(_request);
  const role = authToken?.role;
  const check = denyIfUnauthorized(role, "/api/monitoring", "GET");
  if (!check.allowed) return NextResponse.json(check.response, { status: authToken ? 403 : 401 });

  const isKasir = role === "kasir";
  const kasirLoketCode = isKasir ? (authToken?.loketCode ?? null) : null;

  const idempotencyKey = decodeURIComponent(params.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: "idempotencyKey wajib diisi" }, { status: 400 });
  }

  try {
    const [requestRows] = await pool.query<RowDataPacket[]>(
      `SELECT
          pr.id,
          pr.idempotency_key,
          pr.status,
          pr.provider,
          pr.loket_code,
          pr.username,
          pr.error_code,
          pr.error_message,
          pr.created_at,
          pr.updated_at,
          TIMESTAMPDIFF(SECOND, pr.created_at, pr.updated_at) AS duration_seconds,
          CAST(pr.request_payload AS CHAR) AS request_payload,
          CAST(pr.response_payload AS CHAR) AS response_payload,
          (
            SELECT te.event_type
            FROM transaction_events te
            WHERE te.idempotency_key = pr.idempotency_key
            ORDER BY te.created_at DESC, te.id DESC
            LIMIT 1
          ) AS last_event_type,
          (
            SELECT te.message
            FROM transaction_events te
            WHERE te.idempotency_key = pr.idempotency_key
            ORDER BY te.created_at DESC, te.id DESC
            LIMIT 1
          ) AS last_event_message,
          (
            SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(te.payload_json, '$.attempts')) AS UNSIGNED)
            FROM transaction_events te
            WHERE te.idempotency_key = pr.idempotency_key
              AND JSON_EXTRACT(te.payload_json, '$.attempts') IS NOT NULL
            ORDER BY te.created_at DESC, te.id DESC
            LIMIT 1
          ) AS attempts
       FROM payment_requests pr
       WHERE pr.idempotency_key = ?
       LIMIT 1`,
      [idempotencyKey]
    );

    const requestRow = requestRows[0];
    if (!requestRow) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    // Kasir hanya boleh lihat transaksi loket mereka sendiri
    if (kasirLoketCode && requestRow.loket_code !== kasirLoketCode) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const requestPayload = safeJsonParse<Record<string, unknown>>(requestRow.request_payload);
    const responsePayload = safeJsonParse<Record<string, unknown>>(requestRow.response_payload);

    const [eventRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, event_type, severity, provider, http_status, provider_error_code,
              message, CAST(payload_json AS CHAR) AS payload_json, created_at,
              idempotency_key, transaction_code, cust_id, username, loket_code
         FROM transaction_events
        WHERE idempotency_key = ?
        ORDER BY created_at ASC, id ASC`,
      [idempotencyKey]
    );

    const events = eventRows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      severity: row.severity,
      provider: row.provider,
      httpStatus: row.http_status,
      providerErrorCode: row.provider_error_code,
      message: row.message,
      payload: safeJsonParse<unknown>(row.payload_json) ?? row.payload_json,
      createdAt: row.created_at,
      idempotencyKey: row.idempotency_key,
      transactionCode: row.transaction_code,
      custId: row.cust_id,
      username: row.username,
      loketCode: row.loket_code,
    }));

    const transactionCodes = Array.from(
      new Set(
        events
          .map((event) => event.transactionCode)
          .filter((code): code is string => Boolean(code))
      )
    );

    if (responsePayload?.results && Array.isArray(responsePayload.results)) {
      for (const result of responsePayload.results as Array<{ transactionCode?: string }>) {
        if (result.transactionCode && !transactionCodes.includes(result.transactionCode)) {
          transactionCodes.push(result.transactionCode);
        }
      }
    }

    const customerIds = Array.from(
      new Set(
        ((requestPayload?.bills as Array<{ idpel?: string }> | undefined) || [])
          .map((bill) => bill.idpel)
          .filter((id): id is string => Boolean(id))
      )
    );

    let inquiryEvents: Array<Record<string, unknown>> = [];
    if (customerIds.length > 0) {
      const placeholders = customerIds.map(() => "?").join(", ");
      const [inquiryRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, event_type, severity, provider, http_status, provider_error_code,
                message, CAST(payload_json AS CHAR) AS payload_json, created_at,
                cust_id, username, loket_code
           FROM transaction_events
          WHERE event_type IN ('INQUIRY_REQUEST', 'INQUIRY_SUCCESS', 'INQUIRY_FAILED')
             AND provider = ?
            AND username = ?
            AND cust_id IN (${placeholders})
            AND created_at BETWEEN DATE_SUB(?, INTERVAL 60 MINUTE) AND DATE_ADD(?, INTERVAL 5 MINUTE)
          ORDER BY created_at ASC, id ASC`,
        [requestRow.provider, requestRow.username, ...customerIds, requestRow.created_at, requestRow.created_at]
      );

      const allInquiryEvents = inquiryRows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        severity: row.severity,
        provider: row.provider,
        httpStatus: row.http_status,
        providerErrorCode: row.provider_error_code,
        message: row.message,
        payload: safeJsonParse<unknown>(row.payload_json) ?? row.payload_json,
        createdAt: row.created_at,
        custId: row.cust_id,
        username: row.username,
        loketCode: row.loket_code,
      }));

      // Deduplicate: keep only the latest event per custId + eventType
      const seen = new Map<string, number>();
      for (let i = allInquiryEvents.length - 1; i >= 0; i--) {
        const key = `${allInquiryEvents[i].custId}::${allInquiryEvents[i].eventType}`;
        if (!seen.has(key)) seen.set(key, i);
      }
      inquiryEvents = Array.from(seen.values()).sort((a, b) => a - b).map((i) => allInquiryEvents[i]);
    }

    let bills: Array<Record<string, unknown>> = [];
    if (transactionCodes.length > 0) {
      const placeholders = transactionCodes.map(() => "?").join(", ");

      // Unified query from multi_payment_items
      const [mpiRows] = await pool.query<RowDataPacket[]>(
        `SELECT i.id, i.provider, i.transaction_code,
                COALESCE(i.paid_at, i.created_at) as transaction_date,
                i.customer_id, i.customer_name, i.product_code,
                i.period_label, i.amount, i.admin_fee, i.total,
                r.username, r.loket_name, r.loket_code,
                i.status, i.provider_error_code, i.provider_error_message,
                i.paid_at, i.failed_at, i.advice_attempts,
                CAST(i.metadata_json AS CHAR) AS metadata_json,
                CAST(i.provider_response AS CHAR) AS provider_response
           FROM multi_payment_items i
           JOIN multi_payment_requests r ON r.id = i.multi_payment_id
          WHERE i.transaction_code IN (${placeholders})
          ORDER BY i.created_at ASC, i.transaction_code ASC`,
        transactionCodes
      );

      const statusFlagMap: Record<string, string> = {
        SUCCESS: "LUNAS", FAILED: "GAGAL", PENDING: "PENDING",
        PENDING_ADVICE: "PENDING", PENDING_PROVIDER: "PENDING",
      };

      bills = mpiRows.map((row) => {
        const meta = safeJsonParse<Record<string, unknown>>(row.metadata_json) || {};
        const provRes = safeJsonParse<Record<string, unknown>>(row.provider_response) || {};
        // provider_response stores the full LunasinResponse wrapper; actual data fields live inside .data
        const provResData = (provRes.data as Record<string, unknown>) ?? provRes;
        const provider = String(row.provider || "").toUpperCase();

        const base: Record<string, unknown> = {
          id: row.id,
          provider,
          transactionCode: row.transaction_code,
          transactionDate: row.transaction_date,
          custId: row.customer_id,
          nama: row.customer_name,
          alamat: meta.alamat || "",
          blth: row.period_label || meta.blth || "",
          periode: row.period_label || meta.blth || "",
          kodeProduk: row.product_code,
          subTotal: Number(row.amount || 0),
          admin: Number(row.admin_fee || 0),
          total: Number(row.total || 0),
          username: row.username,
          loketName: row.loket_name,
          loketCode: row.loket_code,
          flagTransaksi: statusFlagMap[row.status] || row.status,
          processingStatus: row.status,
          providerErrorCode: row.provider_error_code,
          providerErrorMessage: row.provider_error_message,
          paidAt: row.paid_at,
          failedAt: row.failed_at,
          adviceAttempts: Number(row.advice_attempts || 0),
          refnumLunasin: provResData.refnum_lunasin || meta.refnum_lunasin || null,
        };

        // PDAM-specific fields from metadata
        if (provider === "PDAM") {
          base.hargaAir = Number(meta.harga_air || 0);
          base.abodemen = Number(meta.abodemen || 0);
          base.materai = Number(meta.materai || 0);
          base.limbah = Number(meta.limbah || 0);
          base.retribusi = Number(meta.retribusi || 0);
          base.denda = Number(meta.denda || 0);
          base.standLalu = Number(meta.stand_lalu || 0);
          base.standKini = Number(meta.stand_kini || 0);
          base.gol = meta.idgol || meta.gol || "";
          base.jenisLoket = meta.jenis_loket || "";
          base.bebanTetap = Number(meta.beban_tetap || 0);
          base.biayaMeter = Number(meta.biaya_meter || 0);
          base.diskon = Number(meta.diskon || 0);
        }

        return base;
      });

    }

    const results = Array.isArray(responsePayload?.results)
      ? (responsePayload.results as Array<{ success?: boolean; total?: number }>)
      : [];

    const rawPaymentResponses = events
      .map((event) => ({
        eventType: event.eventType,
        createdAt: event.createdAt,
        httpStatus: event.httpStatus,
        providerErrorCode: event.providerErrorCode,
        rawResponse:
          event.payload && typeof event.payload === "object" && event.payload !== null && "rawResponse" in (event.payload as Record<string, unknown>)
            ? (event.payload as Record<string, unknown>).rawResponse
            : null,
      }))
      .filter((entry) => entry.rawResponse);

    const rawInquiryResponses = inquiryEvents
      .map((event) => ({
        eventType: event.eventType,
        createdAt: event.createdAt,
        httpStatus: event.httpStatus,
        providerErrorCode: event.providerErrorCode,
        custId: event.custId,
        rawResponse:
          event.payload && typeof event.payload === "object" && event.payload !== null && "rawResponse" in (event.payload as Record<string, unknown>)
            ? (event.payload as Record<string, unknown>).rawResponse
            : null,
      }))
      .filter((entry) => entry.rawResponse);

    const hasAdviceSuccess = events.some((event) => event.eventType === "ADVICE_SUCCESS");
    const hasAdviceFailed = events.some((event) => event.eventType === "ADVICE_FAILED" || event.eventType === "ADVICE_ERROR");
    const hasAdvicePending = events.some((event) => event.eventType === "ADVICE_PENDING");
    const hasProviderSuccess = events.some((event) => event.eventType === "PAYMENT_PROVIDER_SUCCESS");
    const hasProviderFailed = events.some((event) => event.eventType === "PAYMENT_PROVIDER_FAILED");

    const transaction = {
      id: requestRow.id,
      idempotencyKey: requestRow.idempotency_key,
      status: requestRow.status,
      provider: requestRow.provider,
      loketCode: requestRow.loket_code,
      username: requestRow.username,
      errorCode: requestRow.error_code,
      errorMessage: requestRow.error_message,
      errorCategory: categorizeError(requestRow.error_code, requestRow.last_event_type),
      createdAt: requestRow.created_at,
      updatedAt: requestRow.updated_at,
      durationSeconds: Number(requestRow.duration_seconds ?? 0),
      attempts: requestRow.attempts != null ? Number(requestRow.attempts) : null,
      lastEventType: requestRow.last_event_type,
      lastEventMessage: requestRow.last_event_message,
      transactionCodes,
      billCount: bills.length || ((requestPayload?.bills as unknown[])?.length ?? 0),
      successBills: results.filter((item) => item.success).length,
      failedBills: results.filter((item) => item.success === false).length,
      totalNominal:
        bills.reduce((sum, bill) => sum + Number((bill.total as number) || 0), 0) ||
        results.reduce((sum, item) => sum + Number(item.total || 0), 0),
    };

    const reconciliation = {
      localStatus: requestRow.status,
      providerStatus: hasAdviceSuccess || hasProviderSuccess
        ? "SUCCESS"
        : hasAdvicePending || requestRow.error_code === "LUNASIN_PENDING"
          ? "PENDING"
          : hasAdviceFailed || hasProviderFailed
          ? "FAILED"
          : "UNKNOWN",
      finalizationStatus: events.some((event) => event.eventType === "PAYMENT_DB_FINALIZE_FAILED")
        ? "DB_FINALIZE_FAILED"
        : bills.some((bill) => bill.processingStatus === "PENDING")
          ? "WAITING_PROVIDER_CONFIRMATION"
          : bills.length > 0 && bills.every((bill) => bill.processingStatus === "SUCCESS")
            ? "FINALIZED"
            : bills.some((bill) => bill.processingStatus === "FAILED")
              ? "FINALIZED_WITH_FAILURE"
              : events.some((event) => event.eventType === "PAYMENT_REQUEST_UPDATED_BY_ADVICE")
                ? "UPDATED_BY_ADVICE"
        : events.some((event) => event.eventType === "PAYMENT_REQUEST_COMPLETED")
          ? "FINALIZED"
          : "PENDING",
      manuallyResolved: events.some((event) => event.eventType === "PAYMENT_MANUALLY_RESOLVED"),
    };

    return NextResponse.json({
      transaction,
      requestPayload,
      responsePayload,
      reconciliation,
      events,
      inquiryEvents,
      rawInquiryResponses,
      rawPaymentResponses,
      bills,
    });
  } catch (error) {
    console.error("Monitoring detail error:", error);
    return NextResponse.json({ error: "Gagal mengambil detail transaksi" }, { status: 500 });
  }
}