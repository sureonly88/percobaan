/**
 * Per-provider sliding window rate limiter.
 * Tracks request counts per provider per minute and per day.
 */

interface WindowEntry {
  timestamps: number[];
}

const minuteWindows = new Map<number, WindowEntry>();
const dayWindows = new Map<number, WindowEntry>();

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pruneTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  // Find index of first timestamp within the window
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i++;
  return i > 0 ? timestamps.slice(i) : timestamps;
}

export interface RateLimitResult {
  allowed: boolean;
  limitType?: "minute" | "day";
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check and record a request for rate limiting.
 * Returns whether the request is allowed.
 */
export function checkProviderRateLimit(
  providerId: number,
  limitPerMinute: number,
  limitPerDay: number
): RateLimitResult {
  const now = Date.now();

  // Check minute window
  let minuteEntry = minuteWindows.get(providerId);
  if (!minuteEntry) {
    minuteEntry = { timestamps: [] };
    minuteWindows.set(providerId, minuteEntry);
  }
  minuteEntry.timestamps = pruneTimestamps(minuteEntry.timestamps, MINUTE_MS, now);

  if (minuteEntry.timestamps.length >= limitPerMinute) {
    const oldestInWindow = minuteEntry.timestamps[0];
    const retryAfterMs = MINUTE_MS - (now - oldestInWindow);
    return {
      allowed: false,
      limitType: "minute",
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  // Check day window
  let dayEntry = dayWindows.get(providerId);
  if (!dayEntry) {
    dayEntry = { timestamps: [] };
    dayWindows.set(providerId, dayEntry);
  }
  dayEntry.timestamps = pruneTimestamps(dayEntry.timestamps, DAY_MS, now);

  if (dayEntry.timestamps.length >= limitPerDay) {
    const oldestInWindow = dayEntry.timestamps[0];
    const retryAfterMs = DAY_MS - (now - oldestInWindow);
    return {
      allowed: false,
      limitType: "day",
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  // Record this request
  minuteEntry.timestamps.push(now);
  dayEntry.timestamps.push(now);

  const remainingMinute = limitPerMinute - minuteEntry.timestamps.length;
  const remainingDay = limitPerDay - dayEntry.timestamps.length;

  return {
    allowed: true,
    remaining: Math.min(remainingMinute, remainingDay),
    retryAfterMs: 0,
  };
}

// Periodic cleanup (every 10 minutes) — remove entries with no recent timestamps
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    minuteWindows.forEach((entry, id) => {
      entry.timestamps = pruneTimestamps(entry.timestamps, MINUTE_MS, now);
      if (entry.timestamps.length === 0) minuteWindows.delete(id);
    });
    dayWindows.forEach((entry, id) => {
      entry.timestamps = pruneTimestamps(entry.timestamps, DAY_MS, now);
      if (entry.timestamps.length === 0) dayWindows.delete(id);
    });
  }, 10 * 60 * 1000);
}
