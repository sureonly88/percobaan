// Simple in-memory rate limiter for login protection
const attempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const record = attempts.get(key);

  // Clean expired entry
  if (record && now > record.resetAt) {
    attempts.delete(key);
  }

  const current = attempts.get(key);

  if (!current) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 };
  }

  if (current.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }

  current.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - current.count, retryAfterMs: 0 };
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
