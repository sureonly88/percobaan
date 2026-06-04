import type { PaymentInvoice, PaymentInvoiceItem } from "./types";
import { getAppBaseUrl } from "./code";

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 6) return phone[0] + "***";
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

export function toPublicInvoice(invoice: PaymentInvoice, items: PaymentInvoiceItem[]) {
  const appUrl = getAppBaseUrl();
  return {
    invoiceCode: invoice.invoiceCode,
    status: invoice.status,
    customerName: invoice.customerName,
    customerPhone: maskPhone(invoice.customerPhone),
    totalItems: invoice.totalItems,
    totalAmount: invoice.totalAmount,
    totalAdmin: invoice.totalAdmin,
    gatewayFee: invoice.gatewayFee,
    grandTotal: invoice.grandTotal,
    expiresAt: invoice.expiresAt,
    snapUrl: ["UNPAID", "PAYMENT_PENDING"].includes(invoice.status) ? invoice.snapUrl : null,
    receiptUrl: invoice.receiptToken ? `${appUrl}/r/${invoice.receiptToken}` : null,
    items: items.map((item) => ({
      provider: item.provider,
      serviceType: item.serviceType,
      customerId: item.customerId,
      customerName: item.customerName,
      productCode: item.productCode,
      periodLabel: item.periodLabel,
      amount: item.amount,
      adminFee: item.adminFee,
      total: item.total,
      status: item.status,
    })),
  };
}
