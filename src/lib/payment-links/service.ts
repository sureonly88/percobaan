import { createSnapTransaction, getTransactionStatus, mapMidtransStatus } from "@/lib/midtrans";
import { logTransactionEventSafe } from "@/lib/transaction-events";
import { createNotificationSafe } from "@/lib/notifications";
import { orchestrateMultiPayment } from "@/lib/multipay/orchestrator";
import type { MultiPaymentRequestStatus, UnifiedPaymentItemInput } from "@/lib/multipay/types";
import { generateGatewayOrderId, getAppBaseUrl } from "./code";
import type { CreatePaymentLinkInput, PaymentInvoice, PaymentInvoiceStatus } from "./types";
import {
  addInvoiceEvent,
  claimInvoiceForProviderProcessing,
  createPaymentInvoice,
  finalizeInvoiceProvider,
  findInvoiceByGatewayOrderId,
  findInvoiceByPublicToken,
  getInvoiceItems,
  updateInvoiceGateway,
  updateInvoiceStatus,
} from "./repository";
import { ensureDisputeForInvoice } from "./disputes";

export async function createPaymentLink(input: CreatePaymentLinkInput) {
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    throw new Error("idempotencyKey tidak valid");
  }
  if (!input.items?.length) throw new Error("Item invoice tidak boleh kosong");
  const invalid = input.items.find((item) => item.total !== item.amount + item.adminFee);
  if (invalid) throw new Error(`Total item ${invalid.customerId} tidak sesuai amount + adminFee`);

  const created = await createPaymentInvoice(input);
  const publicUrl = `${getAppBaseUrl()}/i/${created.publicToken}`;

  await logTransactionEventSafe({
    idempotencyKey: input.idempotencyKey,
    provider: "MULTIPAY",
    eventType: "PAYMENT_LINK_CREATED",
    severity: "INFO",
    username: input.createdBy,
    loketCode: input.loketCode,
    message: `Payment link ${created.invoiceCode} dibuat`,
    payload: { invoiceCode: created.invoiceCode, publicUrl },
  });

  return { ...created, publicUrl };
}

export async function startInvoicePayment(publicToken: string) {
  const invoice = await findInvoiceByPublicToken(publicToken);
  if (!invoice) throw new Error("Invoice tidak ditemukan");
  if (!["UNPAID", "PAYMENT_PENDING"].includes(invoice.status)) {
    return { invoice, snapToken: invoice.snapToken, snapUrl: invoice.snapUrl };
  }
  if (invoice.expiresAt && new Date(invoice.expiresAt).getTime() < Date.now()) {
    await updateInvoiceStatus(invoice.id, "EXPIRED");
    await addInvoiceEvent({ invoiceId: invoice.id, eventType: "PAYMENT_LINK_EXPIRED", actorType: "system", beforeStatus: invoice.status, afterStatus: "EXPIRED" });
    throw new Error("Invoice sudah kedaluwarsa");
  }
  if (invoice.snapToken && invoice.snapUrl && invoice.gatewayOrderId) {
    return { invoice, snapToken: invoice.snapToken, snapUrl: invoice.snapUrl };
  }

  const orderId = generateGatewayOrderId(invoice.invoiceCode);
  const appUrl = getAppBaseUrl();
  const snap = await createSnapTransaction({
    orderId,
    grossAmount: invoice.grandTotal,
    customerName: invoice.customerName || invoice.customerPhone || invoice.invoiceCode,
    customerEmail: invoice.customerEmail || undefined,
    itemName: `Pembayaran tagihan ${invoice.invoiceCode}`,
    callbacks: {
      finish: `${appUrl}/invoice/${publicToken}/finish`,
      unfinish: `${appUrl}/invoice/${publicToken}/unfinish`,
      error: `${appUrl}/invoice/${publicToken}/error`,
    },
  });

  await updateInvoiceGateway({
    invoiceId: invoice.id,
    status: "PAYMENT_PENDING",
    gatewayOrderId: orderId,
    snapToken: snap.token,
    snapUrl: snap.redirect_url,
  });
  await addInvoiceEvent({ invoiceId: invoice.id, eventType: "PAYMENT_LINK_SNAP_CREATED", actorType: "public", beforeStatus: invoice.status, afterStatus: "PAYMENT_PENDING", payload: { orderId } });

  return { invoice: { ...invoice, status: "PAYMENT_PENDING" as PaymentInvoiceStatus, gatewayOrderId: orderId }, snapToken: snap.token, snapUrl: snap.redirect_url };
}

export async function handlePaymentLinkWebhook(body: Record<string, unknown>) {
  const orderId = String(body.order_id || "");
  const statusCode = String(body.status_code || "");
  const grossAmount = String(body.gross_amount || "");
  const transactionStatus = String(body.transaction_status || "");
  const fraudStatus = body.fraud_status ? String(body.fraud_status) : undefined;
  const paymentType = body.payment_type ? String(body.payment_type) : null;
  const transactionId = body.transaction_id ? String(body.transaction_id) : null;

  const invoice = await findInvoiceByGatewayOrderId(orderId);
  if (!invoice) return { ignored: true, reason: "invoice_not_found" };

  const webhookAmount = Math.round(Number(grossAmount));
  if (webhookAmount !== invoice.grandTotal) {
    await addInvoiceEvent({ invoiceId: invoice.id, eventType: "PAYMENT_LINK_GATEWAY_AMOUNT_MISMATCH", actorType: "gateway", payload: body });
    throw new Error("Nominal webhook tidak sesuai invoice");
  }

  if (["SUCCESS", "PARTIAL_SUCCESS", "PENDING_REVIEW", "FAILED_PROVIDER"].includes(invoice.status)) {
    return { ignored: true, reason: "already_final", status: invoice.status };
  }

  const mapped = mapMidtransStatus(transactionStatus, fraudStatus);
  const alreadyGatewayPaid = ["PAID_GATEWAY", "PROCESSING_PROVIDER"].includes(invoice.status);
  if (alreadyGatewayPaid && mapped !== "SUCCESS") {
    await addInvoiceEvent({
      invoiceId: invoice.id,
      eventType: "PAYMENT_LINK_GATEWAY_NO_DOWNGRADE",
      actorType: "gateway",
      beforeStatus: invoice.status,
      afterStatus: invoice.status,
      payload: body,
    });
    return { ignored: true, reason: "paid_status_no_downgrade", status: invoice.status, mapped, statusCode };
  }

  let nextStatus: PaymentInvoiceStatus = "PAYMENT_PENDING";
  if (mapped === "SUCCESS") nextStatus = alreadyGatewayPaid ? invoice.status : "PAID_GATEWAY";
  if (mapped === "FAILED") nextStatus = "UNPAID";
  if (mapped === "EXPIRED") nextStatus = "EXPIRED";

  await updateInvoiceGateway({
    invoiceId: invoice.id,
    status: nextStatus,
    gatewayTxId: transactionId,
    paymentMethod: paymentType,
    gatewayStatus: transactionStatus,
    gatewayPayload: body,
    paidGateway: mapped === "SUCCESS",
  });
  await addInvoiceEvent({
    invoiceId: invoice.id,
    eventType: mapped === "SUCCESS" ? "PAYMENT_LINK_GATEWAY_SUCCESS" : `PAYMENT_LINK_GATEWAY_${mapped}`,
    actorType: "gateway",
    beforeStatus: invoice.status,
    afterStatus: nextStatus,
    payload: body,
  });

  return { ok: true, status: nextStatus, mapped, statusCode };
}

export async function syncInvoiceGatewayStatus(invoice: PaymentInvoice) {
  if (!invoice.gatewayOrderId) throw new Error("Invoice belum memiliki gateway order ID");
  const status = await getTransactionStatus(invoice.gatewayOrderId);
  return handlePaymentLinkWebhook(status as unknown as Record<string, unknown>);
}

function mapMultipayStatus(status: MultiPaymentRequestStatus): PaymentInvoiceStatus {
  if (status === "SUCCESS") return "SUCCESS";
  if (status === "PARTIAL_SUCCESS") return "PARTIAL_SUCCESS";
  if (status === "PENDING_REVIEW" || status === "PENDING") return "PENDING_REVIEW";
  return "FAILED_PROVIDER";
}

export async function processPaidInvoice(invoice: PaymentInvoice, options?: { baseUrl?: string; internalSecret?: string; retryStaleMinutes?: number }) {
  if (!["PAID_GATEWAY", "PROCESSING_PROVIDER"].includes(invoice.status) || invoice.multiPaymentCode) return null;
  const internalSecret = options?.internalSecret || process.env.CRON_SECRET || (process.env.NODE_ENV === "development" ? "dev-local" : "");
  if (!internalSecret) throw new Error("CRON_SECRET wajib diset untuk proses provider internal");

  const claimed = await claimInvoiceForProviderProcessing(invoice.id, options?.retryStaleMinutes);
  if (!claimed) return null;

  await addInvoiceEvent({ invoiceId: invoice.id, eventType: "PAYMENT_LINK_PROVIDER_PROCESSING", actorType: "system", beforeStatus: invoice.status, afterStatus: "PROCESSING_PROVIDER" });

  const items = await getInvoiceItems(invoice.id);
  const multipayItems: UnifiedPaymentItemInput[] = items.map((item) => ({
    itemCode: item.itemCode,
    provider: item.provider,
    serviceType: item.serviceType,
    customerId: item.customerId,
    customerName: item.customerName || undefined,
    productCode: item.productCode || undefined,
    providerRef: item.providerRef || undefined,
    periodLabel: item.periodLabel || undefined,
    amount: item.amount,
    adminFee: item.adminFee,
    total: item.total,
    metadata: item.metadata,
  }));

  const result = await orchestrateMultiPayment({
    idempotencyKey: invoice.idempotencyKey,
    loketCode: invoice.loketCode || "ONLINE",
    loketName: invoice.loketName || "Online Payment",
    username: invoice.createdBy || "SYSTEM",
    paidAmount: invoice.grandTotal,
    items: multipayItems,
  }, {
    baseUrl: options?.baseUrl || `http://localhost:${process.env.PORT || "3000"}`,
    authorizationHeader: `Internal ${internalSecret}`,
  });

  const nextStatus = mapMultipayStatus(result.status);
  await finalizeInvoiceProvider({ invoiceId: invoice.id, status: nextStatus, multiPaymentCode: result.multiPaymentCode, results: result.results.map((r) => ({ itemCode: r.itemCode, status: r.status })) });
  await addInvoiceEvent({ invoiceId: invoice.id, eventType: "PAYMENT_LINK_PROVIDER_COMPLETED", actorType: "system", beforeStatus: "PROCESSING_PROVIDER", afterStatus: nextStatus, payload: result });

  if (nextStatus === "FAILED_PROVIDER") {
    await ensureDisputeForInvoice({
      invoiceId: invoice.id,
      invoiceCode: invoice.invoiceCode,
      reason: "Provider gagal setelah gateway sukses",
      createdBy: "SYSTEM",
      refundAmount: invoice.grandTotal,
    });
    await addInvoiceEvent({
      invoiceId: invoice.id,
      eventType: "PAYMENT_DISPUTE_OPENED",
      actorType: "system",
      afterStatus: "OPEN",
      payload: { reason: "Provider gagal setelah gateway sukses" },
    });
  }

  await createNotificationSafe({
    recipientUsername: invoice.createdBy || undefined,
    category: "transaksi",
    severity: nextStatus === "SUCCESS" ? "info" : "warning",
    title: nextStatus === "SUCCESS" ? "Payment Link Berhasil" : "Payment Link Perlu Ditinjau",
    message: `Invoice online selesai diproses dengan status ${nextStatus}.`,
    link: "/payment-links",
  });

  return result;
}
