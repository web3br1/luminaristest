/**
 * KPI Cache Service
 *
 * In-memory TTL cache for KPI / analytics preset-group results.
 * Default expiry: 5 minutes (300 000 ms).
 */

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

export class KpiCacheService {
  private readonly store = new Map<string, CacheEntry>();

  /**
   * Returns the cached value for `key` if it exists and has not expired.
   * Returns null otherwise.
   */
  get(key: string): unknown | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < new Date().getTime()) {
      this.store.delete(key);
      return null;
    }
    return entry.result;
  }

  /**
   * Stores `result` under `key` with an expiry of `ttlMs` milliseconds from now.
   */
  set(key: string, result: unknown, ttlMs = 300_000): void {
    this.store.set(key, {
      result,
      expiresAt: new Date().getTime() + ttlMs,
    });
  }

  /**
   * Deletes all cache entries whose key contains the given `userId` prefix.
   */
  invalidate(userId: string): void {
    for (const key of this.store.keys()) {
      if (key.includes(userId)) {
        this.store.delete(key);
      }
    }
  }
}

export const kpiCacheService = new KpiCacheService();
