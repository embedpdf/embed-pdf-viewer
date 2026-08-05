import type { Kysely } from 'kysely';
import type { JWK } from 'jose';
import type { Database as Schema } from '../db/schema';
import type { JwksCacheStore } from './JwtVerifier';

/**
 * `JwksCacheStore` backed by the `jwks_cache` table. The verifier's
 * in-memory layer is cheap and short-TTL; this layer is for
 * surviving pod restarts so we don't slam the customer's IdP on
 * every cold boot.
 */
export class DbJwksCacheStore implements JwksCacheStore {
  constructor(private readonly db: Kysely<Schema>) {}

  async get(issuer: string): Promise<{ jwks: { keys: JWK[] }; expiresAt: number } | null> {
    const row = await this.db
      .selectFrom('jwks_cache')
      .select(['jwks_json', 'expires_at'])
      .where('issuer', '=', issuer)
      .executeTakeFirst();
    if (!row) return null;
    try {
      const jwks = JSON.parse(row.jwks_json) as { keys: JWK[] };
      if (!jwks || !Array.isArray(jwks.keys)) return null;
      return { jwks, expiresAt: row.expires_at };
    } catch {
      // Corrupt cache row — fall through to a remote refetch.
      return null;
    }
  }

  async set(issuer: string, jwks: { keys: JWK[] }, ttlMs: number): Promise<void> {
    const now = Date.now();
    await this.db
      .insertInto('jwks_cache')
      .values({
        issuer,
        jwks_json: JSON.stringify(jwks),
        fetched_at: now,
        expires_at: now + ttlMs,
      })
      .onConflict((oc) =>
        oc.column('issuer').doUpdateSet({
          jwks_json: JSON.stringify(jwks),
          fetched_at: now,
          expires_at: now + ttlMs,
        }),
      )
      .execute();
  }
}
