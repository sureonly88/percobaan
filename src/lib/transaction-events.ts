import pool from "@/lib/db";

export type TransactionEventSeverity = "INFO" | "WARN" | "ERROR";

export interface TransactionEventInput {
  idempotencyKey?: string | null;
  multiPaymentCode?: string | null;
  transactionCode?: string | null;
  provider?: string;
  eventType: string;
  severity?: TransactionEventSeverity;
  httpStatus?: number | null;
  providerErrorCode?: string | null;
  message?: string | null;
  payload?: unknown;
  username?: string | null;
  loketCode?: string | null;
  custId?: string | null;
}

export async function logTransactionEvent(input: TransactionEventInput): Promise<void> {
  await pool.execute(
    `INSERT INTO transaction_events (
      idempotency_key,
      multi_payment_code,
      transaction_code,
      provider,
      event_type,
      severity,
      http_status,
      provider_error_code,
      message,
      payload_json,
      username,
      loket_code,
      cust_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      input.idempotencyKey ?? null,
      input.multiPaymentCode ?? null,
      input.transactionCode ?? null,
      input.provider ?? "PDAM",
      input.eventType,
      input.severity ?? "INFO",
      input.httpStatus ?? null,
      input.providerErrorCode ?? null,
      input.message ?? null,
      input.payload === undefined ? null : JSON.stringify(input.payload),
      input.username ?? null,
      input.loketCode ?? null,
      input.custId ?? null,
    ]
  );
}

export async function logTransactionEventSafe(input: TransactionEventInput): Promise<void> {
  try {
    await logTransactionEvent(input);
  } catch {
    // observability event should never break the main transaction flow
  }
}

/**
 * Fire-and-forget version — does not block the caller at all.
 * Use for non-critical logging in hot paths (payment, inquiry).
 */
export function logTransactionEventFireAndForget(input: TransactionEventInput): void {
  logTransactionEvent(input).catch(() => {});
}