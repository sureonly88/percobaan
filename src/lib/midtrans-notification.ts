/**
 * Penerima notifikasi HTTP Midtrans — SATU logika untuk semua URL webhook
 * (/api/midtrans/notification, /api/topup/webhook, /api/payment-links/webhook), karena
 * dashboard Midtrans hanya menyimpan satu Payment Notification URL. Apa pun URL yang
 * dipasang, notifikasi top-up dan payment link sama-sama diproses.
 *
 * Sesuai rekomendasi dokumentasi Midtrans:
 *   1. Verifikasi signature_key = SHA512(order_id + status_code + gross_amount + ServerKey).
 *   2. Tanyakan Get Status ke Midtrans dan pakai jawaban itu sebagai sumber kebenaran.
 *   3. Proses idempoten (notifikasi bisa datang ganda).
 * Gagal menghubungi Get Status → HTTP 500 agar Midtrans mengirim ulang.
 */
import { getTransactionStatus, verifySignature, type MidtransStatus } from "@/lib/midtrans";
import { GATEWAY_REVERSAL_STATUSES, applyTopupGatewayResult, notifyGatewayReversal } from "@/lib/topup-settlement";
import { handlePaymentLinkWebhook } from "@/lib/payment-links/service";

export interface NotificationResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

export async function handleMidtransNotification(raw: unknown): Promise<NotificationResult> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const orderId = String(body.order_id || "");
  const statusCode = String(body.status_code || "");
  const grossAmount = String(body.gross_amount || "");
  const signatureKey = String(body.signature_key || "");

  if (!orderId || !verifySignature(orderId, statusCode, grossAmount, signatureKey)) {
    console.warn("[midtrans/notification] Signature mismatch for", orderId || "(tanpa order_id)");
    return { httpStatus: 403, body: { error: "Invalid signature" } };
  }

  const kind = orderId.startsWith("TOPUP-") ? "topup" : orderId.startsWith("INV-") ? "payment-link" : null;
  if (!kind) return { httpStatus: 200, body: { message: "Unknown order prefix, ignored" } };

  // Sumber kebenaran: Get Status (bukan isi notifikasi)
  let verified: MidtransStatus;
  try {
    verified = await getTransactionStatus(orderId);
  } catch (e) {
    console.error("[midtrans/notification] Get Status gagal untuk", orderId, e instanceof Error ? e.message : e);
    return { httpStatus: 500, body: { error: "Gagal verifikasi status ke Midtrans, coba lagi" } };
  }
  if (!verified.transaction_status) {
    return { httpStatus: 200, body: { message: "Transaksi belum ada di Midtrans, ignored" } };
  }
  if (verified.order_id && verified.order_id !== orderId) {
    return { httpStatus: 400, body: { error: "order_id tidak cocok dengan Get Status" } };
  }

  if (kind === "topup") {
    const result = await applyTopupGatewayResult({
      orderId,
      transactionStatus: verified.transaction_status,
      fraudStatus: verified.fraud_status,
      grossAmount: verified.gross_amount,
      paymentType: verified.payment_type,
      transactionId: verified.transaction_id,
      payload: { notification: body, status: verified },
      source: "webhook",
    });
    switch (result.kind) {
      case "not_found":
        return { httpStatus: 200, body: { message: "Order not found, ignored" } };
      case "amount_mismatch":
        return { httpStatus: 400, body: { error: "Nominal tidak sesuai topup" } };
      case "already_final":
        return { httpStatus: 200, body: { message: "Already processed", status: result.status } };
      default:
        return { httpStatus: 200, body: { message: "OK", status: result.status } };
    }
  }

  // Payment link (invoice online)
  const result = (await handlePaymentLinkWebhook(verified as unknown as Record<string, unknown>)) as Record<string, unknown>;
  if (
    result.ignored &&
    (result.reason === "paid_status_no_downgrade" || result.reason === "already_final") &&
    GATEWAY_REVERSAL_STATUSES.has(verified.transaction_status)
  ) {
    await notifyGatewayReversal({ kind: "payment-link", orderId, transactionStatus: verified.transaction_status, amount: Number(verified.gross_amount || 0) });
  }
  return { httpStatus: 200, body: { message: "OK", ...result } };
}
