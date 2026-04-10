import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canProcessPayment, normalizeRole } from "@/lib/rbac";
import { LunasinApiError, lunasinAdvice } from "@/lib/lunasin-api";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { logTransactionEventSafe } from "@/lib/transaction-events";
import { notifyLowBalance } from "@/lib/notifications";

const MAX_ADVICE_ATTEMPTS = 3;

function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function findIdempotencyKeyByTransactionCode(transactionCode?: string): Promise<string | null> {
  if (!transactionCode) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT idempotency_key
       FROM transaction_events
      WHERE transaction_code = ?
        AND idempotency_key IS NOT NULL
        AND idempotency_key <> ''
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [transactionCode]
  );

  return rows[0]?.idempotency_key ? String(rows[0].idempotency_key) : null;
}

/* ── Sync parent multi_payment_requests after item status change ── */
async function syncMultiPaymentParent(transactionCode: string) {
  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT multi_payment_id FROM multi_payment_items WHERE transaction_code = ? LIMIT 1`,
    [transactionCode]
  );
  if (itemRows.length === 0) return;

  const parentId = itemRows[0].multi_payment_id;

  const [allItems] = await pool.query<RowDataPacket[]>(
    `SELECT item_code, provider, service_type, customer_id, customer_name,
            status, transaction_code, provider_error_code, provider_error_message,
            CAST(provider_response AS CHAR) AS provider_response
       FROM multi_payment_items WHERE multi_payment_id = ?`,
    [parentId]
  );

  const statuses = allItems.map((r) => r.status as string);
  const successCount = statuses.filter((s) => s === "SUCCESS").length;
  const pendingCount = statuses.filter((s) =>
    ["PENDING", "PENDING_ADVICE", "PENDING_PROVIDER"].includes(s)
  ).length;

  let parentStatus: string;
  if (successCount === statuses.length && statuses.length > 0) parentStatus = "SUCCESS";
  else if (pendingCount > 0) parentStatus = successCount > 0 ? "PENDING_REVIEW" : "PENDING";
  else if (successCount > 0) parentStatus = "PARTIAL_SUCCESS";
  else parentStatus = "FAILED";

  const firstProblem = allItems.find((r) => r.status !== "SUCCESS");

  // Rebuild response_payload results from current item states
  const [parentRows] = await pool.query<RowDataPacket[]>(
    `SELECT multi_payment_code, loket_code, loket_name, total_items,
            total_amount, total_admin, grand_total, paid_amount, change_amount,
            CAST(response_payload AS CHAR) AS response_payload
       FROM multi_payment_requests WHERE id = ?`,
    [parentId]
  );
  const parent = parentRows[0];

  let updatedPayload: string | null = null;
  if (parent) {
    const oldResponse = safeJsonParse<Record<string, unknown>>(parent.response_payload);
    const partialSuccess = successCount > 0 && successCount < statuses.length;

    const rebuiltResults = allItems.map((item) => ({
      itemCode: item.item_code,
      provider: item.provider,
      serviceType: item.service_type,
      customerId: item.customer_id,
      customerName: item.customer_name,
      success: item.status === "SUCCESS",
      status: item.status,
      transactionCode: item.transaction_code || undefined,
      errorCode: item.provider_error_code || undefined,
      error: item.provider_error_message || undefined,
      providerData: safeJsonParse<Record<string, unknown>>(item.provider_response) || undefined,
    }));

    const newPayload = {
      ...(oldResponse || {}),
      success: parentStatus === "SUCCESS",
      partialSuccess,
      status: parentStatus,
      message:
        parentStatus === "SUCCESS"
          ? `Semua ${statuses.length} item berhasil diproses`
          : partialSuccess
            ? `${successCount}/${statuses.length} item berhasil diproses`
            : "Multi-payment belum berhasil diproses penuh",
      paidAt: ["SUCCESS", "PARTIAL_SUCCESS"].includes(parentStatus) ? new Date().toISOString() : null,
      results: rebuiltResults,
    };

    updatedPayload = JSON.stringify(newPayload);
  }

  await pool.execute(
    `UPDATE multi_payment_requests
        SET status = ?,
            error_code = ?,
            error_message = ?,
            response_payload = COALESCE(?, response_payload),
            paid_at = CASE WHEN ? IN ('SUCCESS', 'PARTIAL_SUCCESS') THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
            updated_at = NOW()
      WHERE id = ?`,
    [
      parentStatus,
      firstProblem?.provider_error_code || null,
      firstProblem?.provider_error_message || null,
      updatedPayload,
      parentStatus,
      parentId,
    ]
  );
}

/* ── Sync legacy payment_requests from advice results ── */
async function syncPaymentRequestFromLunasinAdvice(idempotencyKey: string) {
  const [requestRows] = await pool.query<RowDataPacket[]>(
    `SELECT loket_code,
            CAST(request_payload AS CHAR) AS request_payload,
            CAST(response_payload AS CHAR) AS response_payload
       FROM payment_requests
      WHERE idempotency_key = ?
      LIMIT 1`,
    [idempotencyKey]
  );

  const requestRow = requestRows[0];
  if (!requestRow) return null;

  const requestPayload = safeJsonParse<Record<string, unknown>>(requestRow.request_payload);
  const responsePayload = safeJsonParse<Record<string, unknown>>(requestRow.response_payload) || {};
  const existingResults = Array.isArray(responsePayload.results)
    ? (responsePayload.results as Array<Record<string, unknown>>)
    : [];

  let transactionCodes = existingResults
    .map((item) => String(item.transactionCode || ""))
    .filter(Boolean);

  if (transactionCodes.length === 0) {
    const [eventRows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT transaction_code
         FROM transaction_events
        WHERE idempotency_key = ?
          AND transaction_code IS NOT NULL
          AND transaction_code <> ''`,
      [idempotencyKey]
    );
    transactionCodes = eventRows
      .map((row) => String(row.transaction_code || ""))
      .filter(Boolean);
  }

  if (transactionCodes.length === 0) return null;

  // Read from multi_payment_items (unified table)
  const placeholders = transactionCodes.map(() => "?").join(", ");
  const [txRows] = await pool.query<RowDataPacket[]>(
    `SELECT transaction_code,
            customer_id as cust_id,
            customer_name as nama,
            product_code as kode_produk,
            period_label as periode,
            total as rp_total,
            advice_attempts,
            status as processing_status,
            provider_error_code,
            provider_error_message,
            CAST(provider_response AS CHAR) AS provider_response
       FROM multi_payment_items
      WHERE transaction_code IN (${placeholders})`,
    transactionCodes
  );

  const txMap = new Map<string, RowDataPacket>();
  for (const row of txRows) {
    txMap.set(String(row.transaction_code), row);
  }

  const updatedResults = transactionCodes.map((code) => {
    const tx = txMap.get(code);
    const existing = existingResults.find((item) => String(item.transactionCode || "") === code) || {};
    const providerResponse = safeJsonParse<Record<string, unknown>>(tx?.provider_response);
    const rawStatus = String(tx?.processing_status || "");
    const finalStatus = rawStatus === "SUCCESS"
      ? "SUCCESS"
      : rawStatus === "FAILED"
        ? "FAILED"
        : "PENDING";

    return {
      ...existing,
      idpel: String(existing.idpel || tx?.cust_id || ""),
      transactionCode: code,
      success: rawStatus === "SUCCESS",
      error: rawStatus === "FAILED"
        ? String(tx?.provider_error_message || existing.error || "Pembayaran gagal (advice)")
        : rawStatus !== "SUCCESS"
          ? "Transaksi pending, silakan lakukan advice manual"
          : undefined,
      errorCode: rawStatus === "FAILED"
        ? String(tx?.provider_error_code || existing.errorCode || "LUNASIN_FAILED")
        : rawStatus !== "SUCCESS"
          ? "LUNASIN_PENDING"
          : undefined,
      total: Number(tx?.rp_total || existing.total || 0),
      nama: String(tx?.nama || existing.nama || ""),
      kodeProduk: String(tx?.kode_produk || existing.kodeProduk || ""),
      periode: String(tx?.periode || existing.periode || ""),
      adviceAttempts: Number(tx?.advice_attempts || 0),
      finalStatus,
      providerData: providerResponse?.data || existing.providerData,
    };
  });

  const successCount = updatedResults.filter((item) => item.success).length;
  const pendingCount = updatedResults.filter((item) => item.finalStatus === "PENDING").length;
  const failedCount = updatedResults.filter((item) => item.finalStatus === "FAILED").length;
  const totalCount = updatedResults.length;

  const finalStatus = successCount === totalCount
    ? "SUCCESS"
    : pendingCount > 0
      ? "PENDING"
      : successCount > 0
        ? "PARTIAL_SUCCESS"
        : "FAILED";

  const message = finalStatus === "SUCCESS"
    ? `${successCount} tagihan berhasil dibayarkan`
    : finalStatus === "PENDING"
      ? pendingCount === totalCount
        ? `${pendingCount} tagihan masih pending advice`
        : `${successCount}/${totalCount} berhasil, ${pendingCount} masih pending, ${failedCount} gagal`
      : finalStatus === "PARTIAL_SUCCESS"
        ? `${successCount}/${totalCount} tagihan berhasil, ${failedCount} gagal`
        : `Semua ${totalCount} tagihan gagal diproses`;

  const firstFailed = updatedResults.find((item) => item.finalStatus === "FAILED");

  const updatedResponsePayload = {
    ...responsePayload,
    success: finalStatus === "SUCCESS",
    partialSuccess: finalStatus === "PARTIAL_SUCCESS",
    pending: finalStatus === "PENDING",
    message,
    results: updatedResults,
    loketCode: responsePayload.loketCode || requestRow.loket_code || requestPayload?.loketCode,
    loketName: responsePayload.loketName || requestPayload?.loketName,
    biayaAdmin: responsePayload.biayaAdmin ?? requestPayload?.biayaAdmin ?? 0,
    paidAt: finalStatus === "SUCCESS" ? new Date().toISOString() : responsePayload.paidAt,
    idempotencyKey,
  };

  const errorCode = finalStatus === "SUCCESS"
    ? null
    : finalStatus === "PENDING"
      ? "LUNASIN_PENDING"
      : String(firstFailed?.errorCode || "LUNASIN_FAILED");

  const errorMessage = finalStatus === "SUCCESS"
    ? null
    : finalStatus === "PENDING"
      ? "Sebagian transaksi masih menunggu advice"
      : String(firstFailed?.error || "Pembayaran Lunasin gagal");

  await pool.execute(
    `UPDATE payment_requests
        SET status = ?,
            response_payload = ?,
            error_code = ?,
            error_message = ?,
            updated_at = NOW()
      WHERE idempotency_key = ?`,
    [
      finalStatus,
      JSON.stringify(updatedResponsePayload),
      errorCode,
      errorMessage,
      idempotencyKey,
    ]
  );

  return {
    finalStatus,
    successCount,
    failedCount,
    pendingCount,
    totalCount,
    errorCode,
    errorMessage,
  };
}

/* ── GET: List pending Lunasin transactions that need advice ── */
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canProcessPayment(token.role as string)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses" }, { status: 403 });
  }

  const normalizedRole = normalizeRole(String(token.role || "kasir"));
  const loketCode = String(token.loketCode || "");
  const canSeeAll = normalizedRole === "admin" || normalizedRole === "supervisor";

  try {
    // Primary: multi_payment_items
    const mpiLoketFilter = !canSeeAll && loketCode ? " AND r.loket_code = ?" : "";
    const mpiParams = !canSeeAll && loketCode ? [loketCode] : [];

    const [mpiRows] = await pool.query<RowDataPacket[]>(`
      SELECT i.transaction_code,
             COALESCE(i.paid_at, i.created_at) as transaction_date,
             i.customer_id as cust_id,
             i.customer_name as nama,
             i.product_code as kode_produk,
             i.meta_id_trx as id_trx,
             i.amount as rp_amount,
             i.admin_fee as rp_admin,
             i.total as rp_total,
             r.loket_name, r.loket_code, r.username,
             NULL as provider_rc,
             i.provider_error_code,
             i.provider_error_message,
             i.advice_attempts,
             i.created_at, i.updated_at,
             JSON_UNQUOTE(JSON_EXTRACT(i.metadata_json, '$.input2')) as input2,
             JSON_UNQUOTE(JSON_EXTRACT(i.metadata_json, '$.input3')) as input3
      FROM multi_payment_items i
      JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE i.provider = 'LUNASIN'
        AND i.status IN ('PENDING_ADVICE', 'PENDING_PROVIDER', 'PENDING')
        AND COALESCE(i.advice_attempts, 0) < ${MAX_ADVICE_ATTEMPTS}
        ${mpiLoketFilter}
      ORDER BY i.created_at DESC
      LIMIT 50
    `, mpiParams);

    return NextResponse.json({
      maxAdviceAttempts: MAX_ADVICE_ATTEMPTS,
      transactions: mpiRows.map((row) => {
        const adviceAttempts = Number(row.advice_attempts || 0);
        return {
          ...row,
          advice_attempts: adviceAttempts,
        };
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengambil data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canProcessPayment(token.role as string)) {
    return NextResponse.json({ error: "Anda tidak memiliki akses" }, { status: 403 });
  }

  const body = await req.json();
  const { transactionCode, idpel, kodeProduk, idTrx, input2, input3 } = body as {
    transactionCode?: string;
    idpel: string;
    kodeProduk: string;
    idTrx: string;
    input2?: string;
    input3?: string;
  };

  if (!idpel || !kodeProduk || !idTrx) {
    return NextResponse.json({ error: "Parameter idpel, kodeProduk, dan idTrx wajib diisi" }, { status: 400 });
  }

  const username = String(token.username || token.name || "");
  const relatedIdempotencyKey = transactionCode
    ? await findIdempotencyKeyByTransactionCode(transactionCode)
    : null;

  if (transactionCode) {
    const [itemRows] = await pool.query<RowDataPacket[]>(
      `SELECT advice_attempts, status
         FROM multi_payment_items
        WHERE transaction_code = ?
        LIMIT 1`,
      [transactionCode]
    );

    const item = itemRows[0];
    if (item) {
      const adviceAttempts = Number(item.advice_attempts || 0);
      const overLimit = adviceAttempts >= MAX_ADVICE_ATTEMPTS;

      if (overLimit) {
        await logTransactionEventSafe({
          idempotencyKey: relatedIdempotencyKey,
          transactionCode,
          provider: "LUNASIN",
          eventType: "ADVICE_LIMIT_REACHED",
          severity: "WARN",
          username,
          custId: idpel.trim(),
          message: `Advice diblokir karena sudah mencapai batas ${MAX_ADVICE_ATTEMPTS} kali`,
          payload: {
            adviceAttempts,
            maxAdviceAttempts: MAX_ADVICE_ATTEMPTS,
            itemStatus: item.status,
          },
        });

        return NextResponse.json(
          {
            error: `Advice sudah mencapai batas ${MAX_ADVICE_ATTEMPTS} kali dan tidak bisa diproses lagi dari menu ini.`,
            errorCode: "ADVICE_LIMIT_REACHED",
            adviceAttempts,
            maxAdviceAttempts: MAX_ADVICE_ATTEMPTS,
          },
          { status: 409 }
        );
      }
    }
  }

  try {
    const result = await lunasinAdvice({
      idpel: idpel.trim(),
      kodeProduk,
      idTrx,
      input2: input2 || "",
      input3: input3 || "",
    });

    // Log advice result
    try {
      await pool.execute(
        "INSERT INTO log_inquery (jenis, log, created_at, user_login) VALUES (?, ?, NOW(), ?)",
        [
          `LUNASIN_ADVICE_${result.isSuccess ? "SUCCESS" : result.isFailed ? "FAILED" : "PENDING"}`,
          JSON.stringify({ idpel, kodeProduk, idTrx, response: result.rawResponse }),
          username,
        ]
      );
    } catch {
      // Non-critical
    }

    await logTransactionEventSafe({
      idempotencyKey: relatedIdempotencyKey,
      transactionCode: transactionCode || null,
      provider: "LUNASIN",
      eventType: result.isSuccess ? "ADVICE_SUCCESS" : result.isFailed ? "ADVICE_FAILED" : "ADVICE_PENDING",
      severity: result.isSuccess ? "INFO" : result.isFailed ? "ERROR" : "WARN",
      username,
      custId: idpel.trim(),
      message: `Advice Lunasin: ${result.isSuccess ? "sukses" : result.isFailed ? "gagal" : "masih pending"}`,
      payload: { kodeProduk, idTrx, transactionCode, data: result.data, rawResponse: result.rawResponse },
    });

    let paymentRequestSync: {
      finalStatus: string;
      successCount: number;
      failedCount: number;
      pendingCount: number;
      totalCount: number;
      errorCode: string | null;
      errorMessage: string | null;
    } | null = null;

    // Update both tables if transactionCode provided
    if (transactionCode) {
      // ── Update multi_payment_items (primary) ──
      if (result.isSuccess) {
        await pool.execute(
          `UPDATE multi_payment_items
              SET status = 'SUCCESS',
                  provider_error_code = NULL,
                  provider_error_message = NULL,
                  provider_response = ?,
                  advice_attempts = COALESCE(advice_attempts, 0) + 1,
                  paid_at = NOW(),
                  failed_at = NULL,
                  updated_at = NOW()
            WHERE transaction_code = ?
              AND status IN ('PENDING', 'PENDING_ADVICE', 'PENDING_PROVIDER')`,
          [
            JSON.stringify(result.rawResponse || null),
            transactionCode,
          ]
        );
      } else if (result.isFailed) {
        await pool.execute(
          `UPDATE multi_payment_items
              SET status = 'FAILED',
                  provider_error_code = 'LUNASIN_FAILED',
                  provider_error_message = 'Pembayaran gagal (advice)',
                  provider_response = ?,
                  advice_attempts = COALESCE(advice_attempts, 0) + 1,
                  paid_at = NULL,
                  failed_at = NOW(),
                  updated_at = NOW()
            WHERE transaction_code = ?
              AND status IN ('PENDING', 'PENDING_ADVICE', 'PENDING_PROVIDER')`,
          [
            JSON.stringify(result.rawResponse || null),
            transactionCode,
          ]
        );
      } else {
        await pool.execute(
          `UPDATE multi_payment_items
              SET advice_attempts = COALESCE(advice_attempts, 0) + 1,
                  updated_at = NOW()
            WHERE transaction_code = ?
              AND status IN ('PENDING', 'PENDING_ADVICE', 'PENDING_PROVIDER')`,
          [transactionCode]
        );
      }

      // ── Sync parent multi_payment_requests ──
      try {
        await syncMultiPaymentParent(transactionCode);
      } catch {
        // non-critical
      }

      // Deduct saldo from loket on success
      if (result.isSuccess) {
        try {
          const [txRows] = await pool.query<RowDataPacket[]>(
            `SELECT i.total as rp_total, r.loket_code, r.loket_name
               FROM multi_payment_items i
               JOIN multi_payment_requests r ON r.id = i.multi_payment_id
              WHERE i.transaction_code = ? LIMIT 1`,
            [transactionCode]
          );
          if (txRows.length > 0) {
            const txRow = txRows[0];
            const txLoketCode = txRow.loket_code;
            const txTotal = Number(txRow.rp_total || 0);
            await pool.execute("UPDATE lokets SET pulsa = pulsa - ? WHERE loket_code = ?", [txTotal, txLoketCode]);

            const [balRows] = await pool.query<RowDataPacket[]>(
              "SELECT pulsa FROM lokets WHERE loket_code = ? LIMIT 1",
              [txLoketCode]
            );
            if (balRows.length > 0) {
              notifyLowBalance({
                loketCode: txLoketCode,
                loketName: txRow.loket_name || txLoketCode,
                currentBalance: Number(balRows[0].pulsa || 0),
              });
            }
          }
        } catch {
          // non-critical
        }
      }

      // ── Sync payment_requests ──
      if (relatedIdempotencyKey) {
        paymentRequestSync = await syncPaymentRequestFromLunasinAdvice(relatedIdempotencyKey);

        if (paymentRequestSync) {
          await logTransactionEventSafe({
            idempotencyKey: relatedIdempotencyKey,
            transactionCode,
            provider: "LUNASIN",
            eventType: "PAYMENT_REQUEST_UPDATED_BY_ADVICE",
            severity: paymentRequestSync.finalStatus === "FAILED"
              ? "ERROR"
              : paymentRequestSync.finalStatus === "PENDING"
                ? "WARN"
                : "INFO",
            username,
            custId: idpel.trim(),
            message: `Monitoring payment request diperbarui oleh proses advice (${paymentRequestSync.finalStatus})`,
            providerErrorCode: paymentRequestSync.errorCode,
            payload: paymentRequestSync,
          });
        }
      }
    }

    return NextResponse.json({
      success: result.isSuccess,
      failed: result.isFailed,
      pending: result.isPending,
      data: result.data,
      transactionCode,
      idempotencyKey: relatedIdempotencyKey,
      paymentRequestStatus: paymentRequestSync?.finalStatus || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal melakukan advice";
    const errorCode = err instanceof LunasinApiError ? err.code : "UNKNOWN_ERROR";

    await logTransactionEventSafe({
      idempotencyKey: relatedIdempotencyKey,
      transactionCode: transactionCode || null,
      provider: "LUNASIN",
      eventType: "ADVICE_ERROR",
      severity: "ERROR",
      username,
      custId: idpel.trim(),
      providerErrorCode: errorCode,
      message,
      payload: { kodeProduk, idTrx, transactionCode },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
