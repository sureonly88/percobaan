/**
 * Webhook callback system for provider API.
 * Sends payment results to provider's webhook_url with HMAC signature.
 */

import { createHmac } from "crypto";

interface WebhookPayload {
  event: "payment.success" | "payment.failed";
  idempotency_key: string;
  provider_ref?: string | null;
  transaction_code: string | null;
  cust_id: string;
  amount: number | null;
  admin_fee: number | null;
  total: number | null;
  status: "SUCCESS" | "FAILED";
  error_code?: string | null;
  error_message?: string | null;
  timestamp: string;
}

/**
 * Sign webhook payload using HMAC-SHA256
 */
function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Send webhook notification to provider (fire-and-forget).
 * Retries up to 3 times with exponential backoff.
 */
export async function sendProviderWebhook(
  webhookUrl: string,
  webhookSecret: string | null,
  payload: WebhookPayload,
  maxRetries = 3
): Promise<{ success: boolean; attempts: number }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhookSecret) {
    headers["X-Webhook-Signature"] = signWebhookPayload(body, webhookSecret);
  }
  headers["X-Webhook-Timestamp"] = payload.timestamp;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok || (res.status >= 200 && res.status < 300)) {
        return { success: true, attempts: attempt };
      }

      // 4xx errors (except 429) are not retryable
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { success: false, attempts: attempt };
      }
    } catch {
      // Network error, will retry
    }

    if (attempt < maxRetries) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { success: false, attempts: maxRetries };
}

/**
 * Fire-and-forget webhook with DB status tracking.
 */
export function fireWebhook(
  pool: import("mysql2/promise").Pool,
  transactionId: number | bigint,
  webhookUrl: string,
  webhookSecret: string | null,
  payload: WebhookPayload
): void {
  sendProviderWebhook(webhookUrl, webhookSecret, payload)
    .then(async ({ success, attempts }) => {
      try {
        await pool.execute(
          `UPDATE provider_transactions 
           SET webhook_status = ?, webhook_attempts = ?, webhook_last_attempt = NOW()
           WHERE id = ?`,
          [success ? "sent" : "failed", attempts, transactionId]
        );
      } catch {
        // Silent fail — will be picked up by retry job
      }
    })
    .catch(() => {});
}
