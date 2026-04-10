export type MultiPaymentRequestStatus =
  | "PENDING"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "PENDING_REVIEW";

export type MultiPaymentItemStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "PENDING_PROVIDER"
  | "PENDING_ADVICE";

export type MultiPaymentProvider = "PDAM" | "LUNASIN";

export interface UnifiedPaymentItemInput {
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
}

export interface MultiPaymentRequestInput {
  idempotencyKey: string;
  loketCode: string;
  loketName: string;
  paidAmount: number;
  username: string;
  items: UnifiedPaymentItemInput[];
}

export interface ProviderExecutionContext {
  multiPaymentCode: string;
  idempotencyKey: string;
  loketCode: string;
  loketName: string;
  username: string;
  baseUrl: string;
  cookieHeader?: string;
}

export interface ProviderExecutionItem {
  itemCode: string;
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
}

export interface ProviderExecutionResult {
  itemCode: string;
  provider: MultiPaymentProvider;
  serviceType: string;
  customerId: string;
  customerName?: string;
  success: boolean;
  status: MultiPaymentItemStatus;
  transactionCode?: string;
  errorCode?: string;
  error?: string;
  providerData?: Record<string, unknown>;
}

export interface MultiPaymentResponse {
  success: boolean;
  partialSuccess: boolean;
  multiPaymentCode: string;
  status: MultiPaymentRequestStatus;
  message: string;
  paidAt: string | null;
  loketCode: string;
  loketName: string;
  totalItems: number;
  totalAmount: number;
  totalAdmin: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  results: ProviderExecutionResult[];
}

export interface PaymentProviderAdapter {
  readonly provider: MultiPaymentProvider;
  pay(items: ProviderExecutionItem[], ctx: ProviderExecutionContext): Promise<ProviderExecutionResult[]>;
}