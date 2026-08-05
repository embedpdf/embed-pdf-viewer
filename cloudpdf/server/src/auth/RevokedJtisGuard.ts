import type { Kysely } from 'kysely';
import type { Database as Schema } from '../db/schema';
import type { RealtimeBus } from '../realtime/RealtimeBus';
import type { RevocationCheck } from './JwtVerifier';

export interface RevokedJtisGuardOptions {
  db: Kysely<Schema>;
  /** Max entries cached in memory. Defaults to 10_000. */
  lruSize?: number;
  /**
   * Cache the *negative* answer (jti is NOT revoked) for this many
   * ms. Defaults to 60s. Tradeoff: longer values cut DB load further
   * but delay the propagation of new revocations to other replicas.
   */
  negativeTtlMs?: number;
  /**
   * Cross-replica revocation push. When supplied, `revoke()` publishes
   * after the DB write, AND this guard subscribes so a revocation issued
   * on any replica fills the local LRU immediately — collapsing the
   * negative-cache propagation window from `negativeTtlMs` to
   * notification latency. The DB stays the source of truth; the push is a
   * cache-fill optimization, exactly like the mutation doorbell.
   */
  realtime?: RealtimeBus;
}

interface CacheEntry {
  /** `true` = revoked, `false` = known-not-revoked. */
  revoked: boolean;
  expiresAt: number;
}

/**
 * In-memory LRU front for the `revoked_jtis` table.
 *
 * Hot path: ~99% of tokens are not revoked. We cache the negative
 * answer for `negativeTtlMs` so subsequent requests with the same
 * token (or any token whose jti was recently checked) skip the DB.
 *
 * Cold path: on a cache miss, we ask the DB. If we find the jti in
 * `revoked_jtis`, we cache a positive answer until the token would
 * have expired anyway (so we never re-check a known-revoked jti).
 *
 * Revocation propagates across replicas via the DB (every replica's
 * cache miss eventually hits the table). Set `negativeTtlMs` to a
 * value the security team is comfortable with — a stolen-token
 * window of <= 60s is the industry default.
 */
export class RevokedJtisGuard implements RevocationCheck {
  private readonly db: Kysely<Schema>;
  private readonly lruSize: number;
  private readonly negativeTtlMs: number;
  // Map preserves insertion order; we use it as an LRU by deleting +
  // re-inserting on hit, and shifting the oldest entry off when over
  // capacity.
  private readonly cache = new Map<string, CacheEntry>();

  private readonly realtime?: RealtimeBus;

  constructor(opts: RevokedJtisGuardOptions) {
    this.db = opts.db;
    this.lruSize = opts.lruSize ?? 10_000;
    this.negativeTtlMs = opts.negativeTtlMs ?? 60_000;
    this.realtime = opts.realtime;
    // Remote revocations land in the LRU as positive entries, so the
    // request path on THIS replica rejects the jti without a DB read.
    this.realtime?.subscribeRevocation((jti, expiresAt) => {
      this.put(jti, { revoked: true, expiresAt: Math.max(Date.now() + 1_000, expiresAt) });
    });
  }

  async isRevoked(jti: string): Promise<boolean> {
    const now = Date.now();
    const hit = this.cache.get(jti);
    if (hit && hit.expiresAt > now) {
      // LRU touch.
      this.cache.delete(jti);
      this.cache.set(jti, hit);
      return hit.revoked;
    }

    // Cold path: ask the DB.
    const row = await this.db
      .selectFrom('revoked_jtis')
      .select(['jti', 'expires_at'])
      .where('jti', '=', jti)
      .executeTakeFirst();
    if (row) {
      // Cache the positive answer until the token's own exp; after
      // that the token wouldn't pass signature/exp anyway, so the
      // cache entry becomes irrelevant.
      this.put(jti, { revoked: true, expiresAt: Math.max(now + 1_000, row.expires_at) });
      return true;
    }
    this.put(jti, { revoked: false, expiresAt: now + this.negativeTtlMs });
    return false;
  }

  /**
   * Add a `jti` to the denylist. `expiresAt` should be the token's
   * own `exp` (epoch ms) so the GC sweeper can prune the row once
   * the token would have expired anyway.
   */
  async revoke(input: {
    jti: string;
    tenantId: string | null;
    reason?: string;
    expiresAt: number;
  }): Promise<void> {
    const now = Date.now();
    await this.db
      .insertInto('revoked_jtis')
      .values({
        jti: input.jti,
        tenant_id: input.tenantId,
        reason: input.reason ?? null,
        revoked_at: now,
        expires_at: input.expiresAt,
      })
      .onConflict((oc) =>
        oc.column('jti').doUpdateSet({
          revoked_at: now,
          reason: input.reason ?? null,
          expires_at: input.expiresAt,
        }),
      )
      .execute();
    this.put(input.jti, { revoked: true, expiresAt: input.expiresAt });
    // After the DB write, never before: a subscriber reacting to the push
    // (an SSE close, a sibling replica's cache fill) must find the row.
    if (this.realtime) {
      await this.realtime.publishRevocation(input.jti, input.expiresAt).catch(() => undefined);
    }
  }

  /**
   * GC: delete rows whose `expires_at` is in the past. Run from the
   * same background sweeper that handles stale-pending docs.
   */
  async gcExpired(now: number = Date.now()): Promise<number> {
    const res = await this.db.deleteFrom('revoked_jtis').where('expires_at', '<', now).execute();
    return Number(res[0]?.numDeletedRows ?? 0);
  }

  /** Drop the in-memory cache; useful for tests. */
  clearCache(): void {
    this.cache.clear();
  }

  private put(jti: string, entry: CacheEntry): void {
    if (this.cache.size >= this.lruSize) {
      // Evict oldest insertion.
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(jti, entry);
  }
}
