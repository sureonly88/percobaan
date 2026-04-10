/**
 * Provider API Authentication: API Key + HMAC Signature
 * 
 * Headers required:
 *   X-API-Key: <api_key>
 *   X-Timestamp: <unix_timestamp_seconds>
 *   X-Signature: <HMAC-SHA256(api_key + timestamp + body, api_secret)>
 *   X-Idempotency-Key: <unique_key> (required for payment requests)
 */

import { createHmac, timingSafeEqual } from "crypto";
import pool from "@/lib/db";
import { cached } from "@/lib/cache";

export interface ProviderInfo {
  id: number;
  name: string;
  code: string;
  api_key: string;
  api_secret: string;
  status: string;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  allowed_ips: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  balance: number;
  admin_fee: number;
  user_id: number | null;
  loket_id: number | null;
  username: string | null;
  loket_code: string | null;
  loket_name: string | null;
}

export class ProviderAuthError extends Error {
  statusCode: number;
  errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.name = "ProviderAuthError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Lookup provider by API key (cached 5 minutes)
 */
async function getProviderByApiKey(apiKey: string): Promise<ProviderInfo | null> {
  return cached(`provider:${apiKey}`, async () => {
    const [rows] = await pool.execute(
      `SELECT p.id, p.name, p.code, p.api_key, p.api_secret, p.status,
              p.rate_limit_per_minute, p.rate_limit_per_day,
              p.allowed_ips, p.webhook_url, p.webhook_secret,
              COALESCE(l.pulsa, p.balance) AS balance, COALESCE(l.biaya_admin, p.admin_fee) AS admin_fee,
              p.user_id, p.loket_id,
              u.username, l.loket_code, l.nama AS loket_name
       FROM api_providers p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN lokets l ON l.id = p.loket_id
       WHERE p.api_key = ?`,
      [apiKey]
    );
    const list = rows as ProviderInfo[];
    return list.length > 0 ? list[0] : null;
  }, 300);
}

/**
 * Verify HMAC signature
 */
function verifySignature(apiKey: string, timestamp: string, body: string, secret: string, signature: string): boolean {
  const payload = `${apiKey}${timestamp}${body}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/**
 * Check if the request IP is allowed for this provider
 */
function isIpAllowed(provider: ProviderInfo, clientIp: string): boolean {
  if (!provider.allowed_ips) return true; // null = allow all
  const allowed = provider.allowed_ips.split(",").map((ip) => ip.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(clientIp);
}

/**
 * Extract client IP from request headers
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Authenticate a provider API request.
 * Returns ProviderInfo on success, throws ProviderAuthError on failure.
 */
export async function authenticateProvider(request: Request, body: string): Promise<{ provider: ProviderInfo; clientIp: string }> {
  const apiKey = request.headers.get("x-api-key");
  const timestamp = request.headers.get("x-timestamp");
  const signature = request.headers.get("x-signature");

  // Check required headers
  if (!apiKey || !timestamp || !signature) {
    throw new ProviderAuthError(
      "Missing required headers: X-API-Key, X-Timestamp, X-Signature",
      401,
      "MISSING_AUTH_HEADERS"
    );
  }

  // Validate timestamp format and tolerance
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    throw new ProviderAuthError("Invalid X-Timestamp format", 401, "INVALID_TIMESTAMP");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new ProviderAuthError(
      "Request timestamp expired (tolerance: 5 minutes)",
      401,
      "TIMESTAMP_EXPIRED"
    );
  }

  // Lookup provider
  const provider = await getProviderByApiKey(apiKey);
  if (!provider) {
    throw new ProviderAuthError("Invalid API key", 401, "INVALID_API_KEY");
  }

  // Check provider status
  if (provider.status !== "active") {
    throw new ProviderAuthError(
      `Provider account is ${provider.status}`,
      403,
      "PROVIDER_INACTIVE"
    );
  }

  // Verify HMAC signature
  if (!verifySignature(apiKey, timestamp, body, provider.api_secret, signature)) {
    throw new ProviderAuthError("Invalid signature", 401, "INVALID_SIGNATURE");
  }

  // Check IP whitelist
  const clientIp = getClientIp(request);
  if (!isIpAllowed(provider, clientIp)) {
    throw new ProviderAuthError(
      "Request from unauthorized IP address",
      403,
      "IP_NOT_ALLOWED"
    );
  }

  return { provider, clientIp };
}
