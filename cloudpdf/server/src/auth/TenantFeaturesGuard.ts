import type { Kysely } from 'kysely';

import type { Database as Schema, TenantFeature } from '../db/schema';

export interface TenantFeaturesGuardOptions {
  db: Kysely<Schema>;
  /**
   * How long a tenant's features are trusted before the DB is asked
   * again. Like a suspension, a feature is the operator's switch, and
   * propagation within this TTL across replicas is the contract.
   * Defaults to 30s.
   */
  ttlMs?: number;
  /** Max tenants cached in memory. Defaults to 10_000. */
  lruSize?: number;
}

interface CacheEntry {
  features: ReadonlyArray<TenantFeature>;
  expiresAt: number;
}

/**
 * A module route the tenant may not use: `403 FeatureNotEnabled` when
 * its features don't hold the module, `402 FeatureStopped` when they
 * hold it stopped.
 */
export class TenantFeatureError extends Error {
  readonly code: 'FeatureNotEnabled' | 'FeatureStopped';
  readonly status: 403 | 402;
  readonly details: { feature: string; stopped?: TenantFeature['stopped'] };

  constructor(feature: string, stopped?: TenantFeature['stopped']) {
    super(
      stopped === undefined
        ? `The ${feature} module isn't turned on for this tenant`
        : `The ${feature} module is stopped for this tenant: it reached its ${stopped}`,
    );
    this.name = 'TenantFeatureError';
    this.code = stopped === undefined ? 'FeatureNotEnabled' : 'FeatureStopped';
    this.status = stopped === undefined ? 403 : 402;
    this.details = stopped === undefined ? { feature } : { feature, stopped };
  }
}

/**
 * In-memory TTL/LRU front for `tenants.features_json`, the same shape as
 * `SuspendedTenantsGuard`: the module host asks it on every module
 * route, and the tenants update route primes the local replica, so the
 * TTL only governs other replicas.
 *
 * It answers for every credential, the API token included: a feature is
 * about the tenant, not the caller.
 */
export class TenantFeaturesGuard {
  private readonly db: Kysely<Schema>;
  private readonly ttlMs: number;
  private readonly lruSize: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: TenantFeaturesGuardOptions) {
    this.db = opts.db;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.lruSize = opts.lruSize ?? 10_000;
  }

  /** Throws a `TenantFeatureError` unless the tenant holds `feature`, not stopped. */
  async require(tenantId: string, feature: string): Promise<void> {
    const held = (await this.features(tenantId)).find((f) => f.id === feature);
    if (held === undefined) throw new TenantFeatureError(feature);
    if (held.stopped !== undefined) throw new TenantFeatureError(feature, held.stopped);
  }

  async features(tenantId: string): Promise<ReadonlyArray<TenantFeature>> {
    const now = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiresAt > now) {
      // LRU touch.
      this.cache.delete(tenantId);
      this.cache.set(tenantId, hit);
      return hit.features;
    }
    const row = await this.db
      .selectFrom('tenants')
      .select('features_json')
      .where('id', '=', tenantId)
      .executeTakeFirst();
    // An unknown tenant has no features; its documents don't exist either.
    const features = row ? (JSON.parse(row.features_json) as TenantFeature[]) : [];
    this.put(tenantId, { features, expiresAt: now + this.ttlMs });
    return features;
  }

  /** Prime the local cache after a features write (the tenants update route). */
  prime(tenantId: string, features: ReadonlyArray<TenantFeature>): void {
    this.put(tenantId, { features, expiresAt: Date.now() + this.ttlMs });
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
