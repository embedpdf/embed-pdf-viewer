import type { Kysely } from 'kysely';

import type { Database as Schema } from '../db/schema';

export interface SuspendedTenantsGuardOptions {
  db: Kysely<Schema>;
  /**
   * How long a per-tenant answer (suspended or active) is trusted
   * before the DB is asked again. Suspension is the operator's
   * circuit breaker, not incident response — propagation within this
   * TTL across replicas is the contract. Defaults to 30s.
   */
  ttlMs?: number;
  /** Max tenants cached in memory. Defaults to 10_000. */
  lruSize?: number;
}

interface CacheEntry {
  suspended: boolean;
  expiresAt: number;
}

/**
 * In-memory TTL/LRU front for `tenants.status`, mirroring
 * `RevokedJtisGuard`'s shape minus the realtime push: revocation kills
 * live credentials and needs sub-minute propagation; suspension gates a
 * tenant's whole namespace and a bounded TTL is the simpler contract.
 * The suspend/resume routes prime the local replica synchronously, so
 * the TTL only governs OTHER replicas.
 *
 * The guard answers for JWT-authenticated requests and share
 * exchanges. API-token requests never consult it — the operator must
 * be able to inspect, resume, or delete a suspended tenant.
 */
export class SuspendedTenantsGuard {
  private readonly db: Kysely<Schema>;
  private readonly ttlMs: number;
  private readonly lruSize: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: SuspendedTenantsGuardOptions) {
    this.db = opts.db;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.lruSize = opts.lruSize ?? 10_000;
  }

  async isSuspended(tenantId: string): Promise<boolean> {
    const now = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiresAt > now) {
      // LRU touch.
      this.cache.delete(tenantId);
      this.cache.set(tenantId, hit);
      return hit.suspended;
    }
    const row = await this.db
      .selectFrom('tenants')
      .select('status')
      .where('id', '=', tenantId)
      .executeTakeFirst();
    // Unknown tenants report "not suspended": existence is the
    // downstream lookup's question (404 vs 403 stays truthful).
    const suspended = row?.status === 'suspended';
    this.put(tenantId, { suspended, expiresAt: now + this.ttlMs });
    return suspended;
  }

  /** Prime the local cache after a status write (suspend/resume route). */
  prime(tenantId: string, suspended: boolean): void {
    this.put(tenantId, { suspended, expiresAt: Date.now() + this.ttlMs });
  }

  /** Drop the in-memory cache; useful for tests. */
  clearCache(): void {
    this.cache.clear();
  }

  private put(tenantId: string, entry: CacheEntry): void {
    if (this.cache.size >= this.lruSize) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(tenantId, entry);
  }
}
