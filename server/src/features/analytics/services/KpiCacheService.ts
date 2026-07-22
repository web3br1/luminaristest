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
   * Deletes all cache entries belonging to `userId`.
   *
   * Keys are built as `${userId}:${suffix}` (see AnalyticsService), so the
   * tenancy segment is everything before the first `:`. The comparison is an
   * EXACT match on that segment — never a substring scan (`key.includes(userId)`
   * would also hit other tenants whose id merely contains this one, and any key
   * whose suffix happens to embed the id).
   */
  invalidate(userId: string): void {
    for (const key of this.store.keys()) {
      const separatorIndex = key.indexOf(':');
      const keyUserId = separatorIndex === -1 ? key : key.slice(0, separatorIndex);
      if (keyUserId === userId) {
        this.store.delete(key);
      }
    }
  }
}

export const kpiCacheService = new KpiCacheService();
