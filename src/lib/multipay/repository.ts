import pool from "@/lib/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import {
  MultiPaymentRequestInput,
  MultiPaymentRequestStatus,
  MultiPaymentResponse,
  ProviderExecutionItem,
  ProviderExecutionResult,
} from "@/lib/multipay/types";

export type CreateMultiPaymentResult =
  | { idempotent: false; id: number }
  | { idempotent: true; id: number; response: MultiPaymentResponse };

export async function createMultiPaymentRequest(params: {
  multiPaymentCode: string;
  input: MultiPaymentRequestInput;
  totalAmount: number;
  totalAdmin: number;
  grandTotal: number;
  changeAmount: number;
}): Promise<CreateMultiPaymentResult> {
  const { multiPaymentCode, input, totalAmount, totalAdmin, grandTotal, changeAmount } = params;

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO multi_payment_requests (
        multi_payment_code,
        idempotency_key,
        status,
        loket_code,
        loket_name,
        username,
        total_items,
        total_amount,
        total_admin,
        grand_total,
        paid_amount,
        change_amount,
        request_payload,
        created_at,
        updated_at
      ) VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        multiPaymentCode,
        input.idempotencyKey,
        input.loketCode,
        input.loketName,
        input.username,
        input.items.length,
        totalAmount,
        totalAdmin,
        grandTotal,
        input.paidAmount,
        changeAmount,
        JSON.stringify(input),
      ]
    );

    return { idempotent: false, id: Number(result.insertId) };
  } catch (error: unknown) {
    const mysqlErr = error as { code?: string };
    if (mysqlErr.code !== "ER_DUP_ENTRY") throw error;

    // Idempotency key already exists — check the existing row
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, status, updated_at, CAST(response_payload AS CHAR) AS response_payload
         FROM multi_payment_requests
        WHERE idempotency_key = ? LIMIT 1`,
      [input.idempotencyKey]
    );

    const existing = rows[0];
    if (!existing) throw error;

    const pendingRetryMinutes = Math.max(5, Number(process.env.MULTIPAY_PENDING_RETRY_MINUTES || 15));
    const pendingUpdatedAt = existing.updated_at ? new Date(existing.updated_at).getTime() : Date.now();
    const pendingIsStale = Date.now() - pendingUpdatedAt >= pendingRetryMinutes * 60_000;

    if (existing.status === "PENDING" && !pendingIsStale) {
      throw new Error("Transaksi dengan idempotencyKey ini sedang diproses");
    }

    if (["SUCCESS", "PARTIAL_SUCCESS"].includes(existing.status)) {
      const parsed = existing.response_payload
        ? JSON.parse(existing.response_payload)
        : null;
      if (parsed) return { idempotent: true, id: Number(existing.id), response: parsed } as CreateMultiPaymentResult;
    }

    // For failed/pending_review rows, reset to PENDING for retry
    await pool.execute(
      `UPDATE multi_payment_requests
          SET multi_payment_code = ?,
              status = 'PENDING',
              loket_code = ?, loket_name = ?, username = ?,
              total_items = ?, total_amount = ?, total_admin = ?,
              grand_total = ?, paid_amount = ?, change_amount = ?,
              request_payload = ?,
              response_payload = NULL,
              error_code = NULL, error_message = NULL,
              paid_at = NULL,
              updated_at = NOW()
        WHERE id = ?`,
      [
        multiPaymentCode,
        input.loketCode, input.loketName, input.username,
        input.items.length, totalAmount, totalAdmin,
        grandTotal, input.paidAmount, changeAmount,
        JSON.stringify(input),
        existing.id,
      ]
    );

    // Clean up old items linked to this request
    await pool.execute(
      `DELETE FROM multi_payment_items WHERE multi_payment_id = ?`,
      [existing.id]
    );

    return { idempotent: false, id: Number(existing.id) };
  }
}

export async function createMultiPaymentItems(multiPaymentId: number, items: ProviderExecutionItem[]) {
  if (items.length === 0) return;

  const placeholders = items
    .map(
      () =>
        `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`
    )
    .join(", ");

  const values: Array<string | number | null> = [];
  for (const item of items) {
    values.push(
      multiPaymentId,
      item.itemCode,
      item.provider,
      item.serviceType,
      item.customerId,
      item.customerName || null,
      item.productCode || null,
      item.providerRef || null,
      item.periodLabel || null,
      item.amount,
      item.adminFee,
      item.total,
      item.metadata ? JSON.stringify(item.metadata) : null
    );
  }

  await pool.execute(
    `INSERT INTO multi_payment_items (
      multi_payment_id,
      item_code,
      provider,
      service_type,
      customer_id,
      customer_name,
      product_code,
      provider_ref,
      period_label,
      amount,
      admin_fee,
      total,
      metadata_json,
      created_at,
      updated_at
    ) VALUES ${placeholders}`,
    values
  );
}

export async function updateMultiPaymentItems(multiPaymentId: number, results: ProviderExecutionResult[]) {
  for (const result of results) {
    let effectiveStatus = result.status;
    let effectiveErrorCode = result.errorCode || null;
    let effectiveError = result.error || null;

    // Cegah duplikat PENDING_ADVICE: 1 nopelanggan + blth hanya boleh ada 1 advice aktif
    if (result.status === "PENDING_ADVICE") {
      const [dupeRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt
           FROM multi_payment_items cur
           JOIN multi_payment_items dup
             ON dup.customer_id = cur.customer_id
            AND dup.period_label <=> cur.period_label
            AND dup.provider = cur.provider
          WHERE cur.multi_payment_id = ? AND cur.item_code = ?
            AND dup.status = 'PENDING_ADVICE'
            AND dup.multi_payment_id != ?`,
        [multiPaymentId, result.itemCode, multiPaymentId]
      );
      if (Number(dupeRows[0]?.cnt ?? 0) > 0) {
        effectiveStatus = "FAILED";
        effectiveErrorCode = "DUPLICATE_PENDING_ADVICE";
        effectiveError = "Sudah ada tagihan advice aktif untuk pelanggan dan periode yang sama";
      }
    }

    const paidAt = effectiveStatus === "SUCCESS" ? new Date() : null;
    const failedAt = effectiveStatus === "FAILED" ? new Date() : null;

    await pool.execute(
      `UPDATE multi_payment_items
          SET status = ?,
              transaction_code = ?,
              provider_error_code = ?,
              provider_error_message = ?,
              provider_response = ?,
              paid_at = ?,
              failed_at = ?,
              updated_at = NOW()
        WHERE multi_payment_id = ? AND item_code = ?`,
      [
        effectiveStatus,
        result.transactionCode || null,
        effectiveErrorCode,
        effectiveError,
        result.providerData ? JSON.stringify(result.providerData) : null,
        paidAt,
        failedAt,
        multiPaymentId,
        result.itemCode,
      ]
    );

    // Jika item ini berhasil dibayar, tutup PENDING_ADVICE lama untuk customer + periode yg sama
    if (effectiveStatus === "SUCCESS") {
      const [itemInfo] = await pool.query<RowDataPacket[]>(
        `SELECT customer_id, period_label, provider FROM multi_payment_items
          WHERE multi_payment_id = ? AND item_code = ? LIMIT 1`,
        [multiPaymentId, result.itemCode]
      );
      if (itemInfo[0]) {
        await pool.execute(
          `UPDATE multi_payment_items
              SET status = 'FAILED',
                  provider_error_code = 'SUPERSEDED_BY_PAYMENT',
                  provider_error_message = 'Tagihan ini sudah lunas melalui transaksi pembayaran lain yang berhasil',
                  failed_at = NOW(),
                  updated_at = NOW()
            WHERE customer_id = ?
              AND period_label <=> ?
              AND provider = ?
              AND status = 'PENDING_ADVICE'
              AND multi_payment_id != ?`,
          [itemInfo[0].customer_id, itemInfo[0].period_label, itemInfo[0].provider, multiPaymentId]
        );
      }

      // ── Expand multi-bulan: PLN Pascabayar & PDAM Lunasin ────────────────────
      // Untuk tagihan dengan jum_tunggakan > 1 bulan, pecah 1 row menjadi N row
      // (1 per periode) agar jumlah rekening di portal cocok dengan rekap Lunasin
      // saat rekonsiliasi (Lunasin menghitung per jum_bill, bukan per IDPEL).
      if (["PLN_POSTPAID", "PDAM_LUNASIN"].includes(result.serviceType || "")) {
        const rawDetail = (result.providerData as Record<string, unknown> | undefined)?.detail;
        const detail = Array.isArray(rawDetail)
          ? (rawDetail as Array<Record<string, unknown>>)
          : [];

        if (detail.length > 1) {
          const [rowData] = await pool.query<RowDataPacket[]>(
            `SELECT admin_fee, transaction_code, provider_response,
                    product_code, provider_ref, customer_id, customer_name,
                    metadata_json
               FROM multi_payment_items
              WHERE multi_payment_id = ? AND item_code = ? LIMIT 1`,
            [multiPaymentId, result.itemCode]
          );

          if (rowData[0]) {
            const r = rowData[0];
            const totalAdminFee = Number(r.admin_fee ?? 0);
            const adminFeePerPeriod = Math.round(totalAdminFee / detail.length);
            // Baris pertama mendapat sisa pembulatan agar jumlah admin tidak berubah
            const adminFeeFirstRow = totalAdminFee - adminFeePerPeriod * (detail.length - 1);

            const firstDetail = detail[0];
            // rp_amount = PLN; rp_total = PDAM Lunasin (field berbeda per docs)
            const firstAmount = Number(firstDetail.rp_amount ?? firstDetail.rp_total ?? 0);
            const firstPeriod = String(firstDetail.periode ?? "");
            // stand_meter = PLN; meter_awal/meter_akhir = PDAM Lunasin
            const firstStandMeter = String(
              firstDetail.stand_meter ??
              (firstDetail.meter_awal != null && firstDetail.meter_akhir != null
                ? `${firstDetail.meter_awal}-${firstDetail.meter_akhir}`
                : "")
            );

            // Gabungkan stand_meter & periode ke metadata_json row asli
            let baseMetadata: Record<string, unknown> = {};
            try { baseMetadata = r.metadata_json ? JSON.parse(r.metadata_json) : {}; } catch { /* ignore */ }
            const firstMetadata = JSON.stringify({ ...baseMetadata, stand_meter: firstStandMeter, periode: firstPeriod });

            // Update row asli → periode pertama dengan admin_fee proporsional
            await pool.execute(
              `UPDATE multi_payment_items
                  SET period_label = ?, amount = ?, admin_fee = ?, total = ?, metadata_json = ?
                WHERE multi_payment_id = ? AND item_code = ?`,
              [firstPeriod, firstAmount, adminFeeFirstRow, firstAmount + adminFeeFirstRow, firstMetadata, multiPaymentId, result.itemCode]
            );

            // Insert 1 row per periode berikutnya dengan admin_fee dibagi rata
            for (let i = 1; i < detail.length; i++) {
              const d = detail[i];
              const periode = String(d.periode ?? `BULAN_${i + 1}`);
              const amount = Number(d.rp_amount ?? d.rp_total ?? 0);
              const standMeter = String(
                d.stand_meter ??
                (d.meter_awal != null && d.meter_akhir != null
                  ? `${d.meter_awal}-${d.meter_akhir}`
                  : "")
              );
              const periodMetadata = JSON.stringify({ ...baseMetadata, stand_meter: standMeter, periode });
              await pool.execute(
                `INSERT INTO multi_payment_items (
                   multi_payment_id, item_code, provider, service_type,
                   customer_id, customer_name, product_code, provider_ref,
                   period_label, amount, admin_fee, total,
                   status, transaction_code, provider_response,
                   paid_at, metadata_json, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, NOW(), ?, NOW(), NOW())`,
                [
                  multiPaymentId,
                  `${result.itemCode}-D${i}`,
                  result.provider,
                  result.serviceType || "PLN_POSTPAID",
                  r.customer_id,
                  r.customer_name ?? null,
                  r.product_code ?? null,
                  r.provider_ref ?? null,
                  periode,
                  amount,
                  adminFeePerPeriod,
                  amount + adminFeePerPeriod,
                  r.transaction_code ?? null,
                  r.provider_response ?? null,
                  periodMetadata,
                ]
              );
            }

            // Perbarui total_items di parent request
            await pool.execute(
              `UPDATE multi_payment_requests
                  SET total_items = total_items + ?
                WHERE id = ?`,
              [detail.length - 1, multiPaymentId]
            );
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────────
    }
  }
}

export async function finalizeMultiPaymentRequest(params: {
  multiPaymentCode: string;
  status: MultiPaymentRequestStatus;
  responsePayload: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const { multiPaymentCode, status, responsePayload, errorCode, errorMessage } = params;

  await pool.execute(
    `UPDATE multi_payment_requests
        SET status = ?,
            response_payload = ?,
            error_code = ?,
            error_message = ?,
            paid_at = CASE WHEN ? IN ('SUCCESS', 'PARTIAL_SUCCESS') THEN NOW() ELSE paid_at END,
            updated_at = NOW()
      WHERE multi_payment_code = ?`,
    [
      status,
      JSON.stringify(responsePayload),
      errorCode || null,
      errorMessage || null,
      status,
      multiPaymentCode,
    ]
  );
}
