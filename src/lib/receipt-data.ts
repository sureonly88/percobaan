import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { findInvoiceByReceiptToken } from "@/lib/payment-links/repository";
import { getAppBaseUrl } from "@/lib/payment-links/code";

function parseJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : (value as Record<string, unknown>);
  } catch {
    return {};
  }
}

export async function buildDigitalReceipt(receiptToken: string) {
  const invoice = await findInvoiceByReceiptToken(receiptToken);
  if (!invoice) return null;

  const available = ["SUCCESS", "PARTIAL_SUCCESS", "PENDING_REVIEW"].includes(invoice.status) && Boolean(invoice.multiPaymentCode);
  if (!available) {
    return {
      available: false,
      status: invoice.status,
      invoiceCode: invoice.invoiceCode,
      message: "Struk belum tersedia karena pembayaran belum selesai.",
    };
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.item_code, i.provider, i.service_type, i.customer_id, i.customer_name,
            i.product_code, i.provider_ref, i.period_label, i.amount, i.admin_fee, i.total,
            i.status, i.transaction_code, CAST(i.provider_response AS CHAR) AS provider_response,
            CAST(i.metadata_json AS CHAR) AS metadata_json, i.paid_at,
            r.multi_payment_code, r.loket_code, r.loket_name, r.username, r.paid_at AS request_paid_at
       FROM multi_payment_items i
       JOIN multi_payment_requests r ON r.id = i.multi_payment_id
      WHERE r.multi_payment_code = ?
      ORDER BY i.id ASC`,
    [invoice.multiPaymentCode]
  );

  return {
    available: true,
    valid: true,
    receiptUrl: `${getAppBaseUrl()}/r/${receiptToken}`,
    invoiceCode: invoice.invoiceCode,
    status: invoice.status,
    multiPaymentCode: invoice.multiPaymentCode,
    paidGatewayAt: invoice.paidGatewayAt,
    providerProcessedAt: invoice.providerProcessedAt,
    customerName: invoice.customerName,
    loketCode: invoice.loketCode || rows[0]?.loket_code || null,
    loketName: invoice.loketName || rows[0]?.loket_name || null,
    kasir: invoice.createdBy || rows[0]?.username || "ONLINE",
    totalAmount: invoice.totalAmount,
    totalAdmin: invoice.totalAdmin,
    grandTotal: invoice.grandTotal,
    paymentMethod: invoice.paymentMethod,
    items: rows.map((row) => {
      const providerData = parseJson(row.provider_response);
      const meta = parseJson(row.metadata_json);
      return {
        itemCode: row.item_code,
        provider: row.provider,
        serviceType: row.service_type,
        customerId: row.customer_id,
        customerName: row.customer_name,
        productCode: row.product_code,
        periodLabel: row.period_label,
        amount: Number(row.amount || 0),
        adminFee: Number(row.admin_fee || 0),
        total: Number(row.total || 0),
        status: row.status,
        transactionCode: row.transaction_code,
        providerRef: row.provider_ref,
        tokenPln: String(meta.tokenPln || providerData.token || ""),
        refnum: String(providerData.refnum || providerData.refnum_lunasin || meta.refnumLunasin || ""),
        paidAt: row.paid_at,
      };
    }),
  };
}
