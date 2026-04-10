// Simple in-memory cache with TTL for master/read-only data
// Reduces repeated DB queries for data that rarely changes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 60 * 1000; // 1 minute

/**
 * Get a cached value, or fetch it from the loader if missing/expired.
 */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key);

  if (existing && now < existing.expiresAt) {
    return existing.data as T;
  }

  const data = await loader();
  store.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/**
 * Invalidate a specific cache key (e.g. after update).
 */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  store.forEach((_, key) => {
    if (key.startsWith(prefix)) store.delete(key);
  });
}

/**
 * Clear entire cache.
 */
export function clearCache(): void {
  store.clear();
}
