import { afterEach, describe, expect, test } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';

import { createSqliteDb, migrate, signDevToken, sqliteMigrations, type DbSchema } from '../src/index';
import { hashSharePassword } from '../src/auth/share-password';
import { SuspendedTenantsGuard } from '../src/auth/SuspendedTenantsGuard';
import { DocumentsRepo } from '../src/db/repos/documents.repo';
import { ShareGrantsRepo, type ShareGrantRow } from '../src/db/repos/share_grants.repo';
import { TenantUsageRepo } from '../src/db/repos/tenant_usage.repo';
import { registerShareSessionRoutes } from '../src/routes/share-sessions';

/**
 * The share exchange's three limiters, tier by tier: per-IP attempts
 * (volume), per-IP failures (probe lockout), per-token attempts
 * (volume, consumed BEFORE the grant row is read). The route is
 * registered directly on a bare Fastify instance with tiny injected
 * budgets — the deps expose them as test seams for exactly this.
 */

const SECRET = 'share-rate-limit-secret';
const TENANT = 'acme';
const DOC = 'doc-1';
const ORIGIN = 'https://viewer.example';

/** Counts repo reads so tests can prove blocked requests do no DB work. */
class CountingGrantsRepo extends ShareGrantsRepo {
  findByIdCalls = 0;

  override async findById(id: string): Promise<ShareGrantRow | null> {
    this.findByIdCalls += 1;
    return super.findById(id);
  }
}

interface Limits {
  ipAttemptLimit?: { maxAttempts: number; windowMs: number };
  tokenAttemptLimit?: { maxAttempts: number; windowMs: number };
  ipFailureLimit?: { maxFailures: number; windowMs: number };
}

interface Fixture {
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  grants: CountingGrantsRepo;
  close: () => Promise<void>;
}

async function makeFixture(limits: Limits = {}): Promise<Fixture> {
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const now = Date.now();
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  await db
    .insertInto('documents')
    .values({
      id: DOC,
      tenant_id: TENANT,
      state: 'ready',
      base_sha: 'a'.repeat(64),
      storage_size_bytes: 4096,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();

  const grants = new CountingGrantsRepo(db);
  const app = Fastify();
  await registerShareSessionRoutes(app, {
    sign: (input) => signDevToken(SECRET, input),
    grants,
    documents: new DocumentsRepo(db),
    suspendedTenants: new SuspendedTenantsGuard({ db }),
    tenantUsage: new TenantUsageRepo(db),
    ...limits,
  });

  return {
    app,
    db,
    grants,
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };
}

function createGrant(
  fx: Fixture,
  extra: { passwordHash?: string } = {},
): Promise<ShareGrantRow> {
  return fx.grants.create({
    tenantId: TENANT,
    docId: DOC,
    scope: ['doc.open'],
    createdBy: 'test',
    ...extra,
  });
}

async function exchange(
  fx: Fixture,
  body: Record<string, unknown>,
  opts: { ip?: string } = {},
): Promise<{ statusCode: number; json: () => any; headers: Record<string, unknown> }> {
  const res = await fx.app.inject({
    method: 'POST',
    url: '/v1/share-sessions',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    payload: body,
    ...(opts.ip ? { remoteAddress: opts.ip } : {}),
  });
  return { statusCode: res.statusCode, json: () => res.json(), headers: res.headers };
}

describe('share exchange rate limiting', () => {
  let fx: Fixture | undefined;

  afterEach(async () => {
    await fx?.close();
    fx = undefined;
  });

  test('per-token attempts are consumed before the grant row is read', async () => {
    fx = await makeFixture({ tokenAttemptLimit: { maxAttempts: 2, windowMs: 60_000 } });
    const share = await createGrant(fx);
    const baseline = fx.grants.findByIdCalls;

    expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(200);
    expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(200);

    const blocked = await exchange(fx, { shareToken: share.id });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('TooManyRequests');
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    // The blocked attempt performed no DB read.
    expect(fx.grants.findByIdCalls).toBe(baseline + 2);
  });

  test('stale (disabled) tokens cannot demand unbounded DB work', async () => {
    fx = await makeFixture({ tokenAttemptLimit: { maxAttempts: 3, windowMs: 60_000 } });
    const share = await createGrant(fx);
    await fx.grants.update(share.id, TENANT, { disabled: true });
    const baseline = fx.grants.findByIdCalls;

    // Stale outcomes stay 404 (never a probe failure), but each one
    // consumes the token's attempt budget…
    for (let i = 0; i < 3; i++) {
      expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(404);
    }
    // …so the polling is bounded instead of a free unlimited DB loop.
    expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(429);
    expect(fx.grants.findByIdCalls).toBe(baseline + 3);
  });

  test('the passphrase prompt roundtrip consumes attempts but not probe budget', async () => {
    fx = await makeFixture({
      tokenAttemptLimit: { maxAttempts: 2, windowMs: 60_000 },
      ipFailureLimit: { maxFailures: 1, windowMs: 60_000 },
    });
    const share = await createGrant(fx, { passwordHash: hashSharePassword('s3cret') });

    // First roundtrip (no password) is the normal prompt flow…
    expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(422);
    // …and did NOT count as a probe failure (budget is 1, so a counted
    // failure would 429 this request), so the retry succeeds…
    expect((await exchange(fx, { shareToken: share.id, password: 's3cret' })).statusCode).toBe(200);
    // …but both roundtrips consumed the token's attempt budget.
    expect((await exchange(fx, { shareToken: share.id, password: 's3cret' })).statusCode).toBe(429);
  });

  test('the per-IP attempt budget fronts everything; other sources are untouched', async () => {
    fx = await makeFixture({ ipAttemptLimit: { maxAttempts: 3, windowMs: 60_000 } });
    const share = await createGrant(fx);

    for (let i = 0; i < 3; i++) {
      expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(200);
    }
    // Blocked before parsing — a valid token does not help the source.
    expect((await exchange(fx, { shareToken: share.id })).statusCode).toBe(429);
    // A different source proceeds.
    expect(
      (await exchange(fx, { shareToken: share.id }, { ip: '203.0.113.9' })).statusCode,
    ).toBe(200);
  });

  test('a blocked token leaves other tokens from the same IP working', async () => {
    fx = await makeFixture({ tokenAttemptLimit: { maxAttempts: 1, windowMs: 60_000 } });
    const a = await createGrant(fx);
    const b = await createGrant(fx);

    expect((await exchange(fx, { shareToken: a.id })).statusCode).toBe(200);
    // Token A is over budget, but the block is per token — the shared
    // NAT keeps exchanging other links.
    expect((await exchange(fx, { shareToken: a.id })).statusCode).toBe(429);
    expect((await exchange(fx, { shareToken: b.id })).statusCode).toBe(200);
  });

  test('a concurrent burst cannot overshoot the attempt budget', async () => {
    fx = await makeFixture({ tokenAttemptLimit: { maxAttempts: 3, windowMs: 60_000 } });
    const share = await createGrant(fx);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => exchange(fx!, { shareToken: share.id })),
    );
    const codes = results.map((r) => r.statusCode);
    // consume() is synchronous and precedes the handler's first await,
    // so the interleaved burst admits exactly the budget.
    expect(codes.filter((c) => c === 200)).toHaveLength(3);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
  });

  test('probing unknown tokens locks the source out via the failure budget', async () => {
    fx = await makeFixture({ ipFailureLimit: { maxFailures: 2, windowMs: 60_000 } });
    const share = await createGrant(fx);

    expect((await exchange(fx, { shareToken: `shr_${'A'.repeat(24)}` })).statusCode).toBe(404);
    expect((await exchange(fx, { shareToken: `shr_${'B'.repeat(24)}` })).statusCode).toBe(404);

    // The source is over its failure budget: locked out, valid token
    // or not, with a Retry-After to come back to.
    const blocked = await exchange(fx, { shareToken: share.id });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
