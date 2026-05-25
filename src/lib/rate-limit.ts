// Simple in-memory rate limiter for login & sensitive endpoint protection.
//
// NOTE: in-memory state hanya valid per-instance Node.js. Jika di-deploy
// multi-replica (PM2 cluster, k8s, dll), ganti ke Redis/Memcached agar
// limit berlaku global.
const attempts = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export interface RateLimitOptions {
  /** Maksimum percobaan per window (default: 5). */
  max?: number;
  /** Window dalam milidetik (default: 15 menit). */
  windowMs?: number;
}

export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = {}
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const max = opts.max ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  const record = attempts.get(key);

  // Clean expired entry
  if (record && now > record.resetAt) {
    attempts.delete(key);
  }

  const current = attempts.get(key);

  if (!current) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  if (current.count >= max) {
    return { allowed: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }

  current.count++;
  return { allowed: true, remaining: max - current.count, retryAfterMs: 0 };
}

export function resetRateLimit(key: string) {
  attempts.delete(key);
}

// Periodic cleanup of expired entries (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    attempts.forEach((record, key) => {
      if (now > record.resetAt) attempts.delete(key);
    });
  }, 5 * 60 * 1000);
}
