import { createHash, randomBytes } from "crypto";
import { logTransactionEventSafe } from "@/lib/transaction-events";
import {
  MultiPaymentRequestInput,
  MultiPaymentResponse,
  MultiPaymentRequestStatus,
  ProviderExecutionItem,
  ProviderExecutionResult,
} from "@/lib/multipay/types";
import {
  createMultiPaymentItems,
  createMultiPaymentRequest,
  finalizeMultiPaymentRequest,
  updateMultiPaymentItems,
} from "@/lib/multipay/repository";
import { getProviderAdapter } from "@/lib/multipay/providers";

interface MultiPaymentRuntimeContext {
  baseUrl: string;
  cookieHeader?: string;
}

function generateMultiPaymentCode() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = randomBytes(4).toString("hex").toUpperCase();
  return `MP-${y}${m}${day}-${rand}`;
}

function generateItemCode(input: MultiPaymentRequestInput, index: number) {
  return createHash("sha1")
    .update(`${input.idempotencyKey}:${index}:${input.items[index].provider}:${input.items[index].customerId}:${input.items[index].serviceType}`)
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
}

function normalizeItems(input: MultiPaymentRequestInput): ProviderExecutionItem[] {
  return input.items.map((item, index) => ({
    itemCode: item.itemCode || generateItemCode(input, index),
    provider: item.provider,
    serviceType: item.serviceType,
    customerId: item.customerId,
    customerName: item.customerName,
    productCode: item.productCode,
    providerRef: item.providerRef,
    periodLabel: item.periodLabel,
    amount: item.amount,
    adminFee: item.adminFee,
    total: item.total,
    metadata: item.metadata,
  }));
}

function buildFinalStatus(results: ProviderExecutionResult[]): MultiPaymentRequestStatus {
  const successCount = results.filter((item) => item.status === "SUCCESS").length;
  const pendingCount = results.filter((item) =>
    ["PENDING", "PENDING_PROVIDER", "PENDING_ADVICE"].includes(item.status)
  ).length;

  if (successCount === results.length && results.length > 0) return "SUCCESS";
  if (pendingCount > 0) return successCount > 0 ? "PENDING_REVIEW" : "PENDING";
  if (successCount > 0) return "PARTIAL_SUCCESS";
  return "FAILED";
}

export async function orchestrateMultiPayment(
  input: MultiPaymentRequestInput,
  runtimeContext: MultiPaymentRuntimeContext
): Promise<MultiPaymentResponse> {
  const items = normalizeItems(input);
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const totalAdmin = items.reduce((sum, item) => sum + item.adminFee, 0);
  const grandTotal = items.reduce((sum, item) => sum + item.total, 0);
  const changeAmount = Math.max(0, input.paidAmount - grandTotal);
  const multiPaymentCode = generateMultiPaymentCode();

  const createResult = await createMultiPaymentRequest({
    multiPaymentCode,
    input,
    totalAmount,
    totalAdmin,
    grandTotal,
    changeAmount,
  });

  if (createResult.idempotent) {
    return createResult.response;
  }

  const multiPaymentId = createResult.id;

  await createMultiPaymentItems(multiPaymentId, items);

  await logTransactionEventSafe({
    idempotencyKey: input.idempotencyKey,
    multiPaymentCode,
    provider: "MULTIPAY",
    eventType: "MULTI_PAYMENT_CREATED",
    severity: "INFO",
    username: input.username,
    loketCode: input.loketCode,
    message: `Multi-payment ${multiPaymentCode} dibuat dengan ${items.length} item`,
    payload: {
      multiPaymentCode,
      totalItems: items.length,
      totalAmount,
      totalAdmin,
      grandTotal,
    },
  });

  const itemsByProvider = new Map<string, ProviderExecutionItem[]>();
  for (const item of items) {
    const grouped = itemsByProvider.get(item.provider) || [];
    grouped.push(item);
    itemsByProvider.set(item.provider, grouped);
  }

  const results: ProviderExecutionResult[] = [];
  for (const [provider, providerItems] of Array.from(itemsByProvider.entries())) {
    try {
      const adapter = getProviderAdapter(provider as ProviderExecutionItem["provider"]);
      const providerResults = await adapter.pay(providerItems, {
        multiPaymentCode,
        idempotencyKey: input.idempotencyKey,
        loketCode: input.loketCode,
        loketName: input.loketName,
        username: input.username,
        baseUrl: runtimeContext.baseUrl,
        cookieHeader: runtimeContext.cookieHeader,
      });
      results.push(...providerResults);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown provider error";
      results.push(
        ...providerItems.map((item) => ({
          itemCode: item.itemCode,
          provider: item.provider,
          serviceType: item.serviceType,
          customerId: item.customerId,
          customerName: item.customerName,
          success: false,
          status: "FAILED" as const,
          errorCode: "MULTIPAY_PROVIDER_EXCEPTION",
          error: `Provider ${provider} threw: ${errorMessage}`,
        })),
      );
    }
  }

  await updateMultiPaymentItems(multiPaymentId, results);

  const finalStatus = buildFinalStatus(results);
  const successCount = results.filter((item) => item.success).length;
  const partialSuccess = successCount > 0 && successCount < results.length;
  const response: MultiPaymentResponse = {
    success: finalStatus === "SUCCESS",
    partialSuccess,
    multiPaymentCode,
    status: finalStatus,
    message:
      finalStatus === "SUCCESS"
        ? `Semua ${results.length} item berhasil diproses`
        : partialSuccess
          ? `${successCount}/${results.length} item berhasil diproses`
          : "Multi-payment belum berhasil diproses penuh",
    paidAt: finalStatus === "SUCCESS" || finalStatus === "PARTIAL_SUCCESS" ? new Date().toISOString() : null,
    loketCode: input.loketCode,
    loketName: input.loketName,
    totalItems: items.length,
    totalAmount,
    totalAdmin,
    grandTotal,
    paidAmount: input.paidAmount,
    changeAmount,
    results,
  };

  const failedSample = results.find((item) => !item.success);
  await finalizeMultiPaymentRequest({
    multiPaymentCode,
    status: finalStatus,
    responsePayload: response,
    errorCode: failedSample?.errorCode || null,
    errorMessage: failedSample?.error || null,
  });

  await logTransactionEventSafe({
    idempotencyKey: input.idempotencyKey,
    multiPaymentCode,
    provider: "MULTIPAY",
    eventType: "MULTI_PAYMENT_COMPLETED",
    severity: finalStatus === "SUCCESS" ? "INFO" : finalStatus === "FAILED" ? "ERROR" : "WARN",
    username: input.username,
    loketCode: input.loketCode,
    message: response.message,
    payload: {
      multiPaymentCode,
      status: finalStatus,
      successCount,
      totalItems: items.length,
    },
  });

  return response;
}