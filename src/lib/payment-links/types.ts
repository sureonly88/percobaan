import type { MultiPaymentProvider } from "@/lib/multipay/types";

export type PaymentInvoiceStatus =
  | "DRAFT"
  | "UNPAID"
  | "PAYMENT_PENDING"
  | "PAID_GATEWAY"
  | "PROCESSING_PROVIDER"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "PENDING_REVIEW"
  | "FAILED_PROVIDER"
  | "EXPIRED"
  | "CANCELLED";

export interface PaymentLinkItemInput {
  itemCode?: string;
  provider: MultiPaymentProvider;
  serviceType: string;
  customerId: string;
  customerName?: string;
  productCode?: string;
  providerRef?: string;
  periodLabel?: string;
  amount: number;
  adminFee: number;
  total: number;
  metadata?: Record<string, unknown>;
  inquirySnapshot?: Record<string, unknown>;
}

export interface CreatePaymentLinkInput {
  idempotencyKey: string;
  loketCode: string;
  loketName: string;
  createdBy: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  expiresInMinutes?: number;
  notes?: string;
  items: PaymentLinkItemInput[];
}

export interface PaymentInvoiceItem {
  id: number;
  invoiceId: number;
  itemCode: string;
  provider: MultiPaymentProvider;
  serviceType: string;
  customerId: string;
  customerName: string | null;
  productCode: string | null;
  providerRef: string | null;
  periodLabel: string | null;
  amount: number;
  adminFee: number;
  total: number;
  metadata: Record<string, unknown>;
  inquirySnapshot: Record<string, unknown>;
  status: string;
}

export interface PaymentInvoice {
  id: number;
  invoiceCode: string;
  publicToken: string;
  idempotencyKey: string;
  status: PaymentInvoiceStatus;
  loketCode: string | null;
  loketName: string | null;
  createdBy: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  totalItems: number;
  totalAmount: number;
  totalAdmin: number;
  gatewayFee: number;
  grandTotal: number;
  gatewayOrderId: string | null;
  gatewayTxId: string | null;
  paymentMethod: string | null;
  snapToken: string | null;
  snapUrl: string | null;
  gatewayStatus: string | null;
  multiPaymentCode: string | null;
  receiptToken: string | null;
  notes: string | null;
  expiresAt: string | null;
  paidGatewayAt: string | null;
  providerProcessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
