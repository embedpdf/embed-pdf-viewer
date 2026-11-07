import { afterEach, describe, expect, test } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';

import {
  createSqliteDb,
  migrate,
  signDevToken,
  sqliteMigrations,
  type DbSchema,
} from '../src/index';
import { hashGrantPassphrase } from '../src/auth/grant-passphrase';
import { SuspendedTenantsGuard } from '../src/auth/SuspendedTenantsGuard';
import { DocumentsRepo } from '../src/db/repos/documents.repo';
import { GrantsRepo, type GrantRow } from '../src/db/repos/grants.repo';
import { LayersRepo } from '../src/db/repos/page_state.repo';
import { GrantVisitorsRepo } from '../src/db/repos/grant_visitors.repo';
import { VisitorHandles } from '../src/auth/visitor-handle';
import { TenantUsageRepo } from '../src/db/repos/tenant_usage.repo';
import { registerGrantSessionRoutes } from '../src/routes/grant-sessions';

/**
 * The grant exchange's three limiters, tier by tier: per-IP attempts
 * (volume), per-IP failures (probe lockout), per-token attempts
 * (volume, consumed before the grant row is read). The route is
 * registered directly on a bare Fastify instance with tiny injected
 * budgets — the deps expose them as test seams for exactly this.
 */

const SECRET = 'grant-rate-limit-secret';
const TENANT = 'acme';
const DOC = 'doc-1';
const ORIGIN = 'https://viewer.example';

/** Counts repo reads so tests can prove blocked requests do no DB work. */
class CountingGrantsRepo extends GrantsRepo {
  findByIdCalls = 0;

  override async findById(id: string): Promise<GrantRow | null> {
    this.findByIdCalls += 1;
    return super.findById(id);
  }
}

interface Limits {
  ipAttemptLimit?: { maxAttempts: number; windowMs: number };
  grantAttemptLimit?: { maxAttempts: number; windowMs: number };
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
  await registerGrantSessionRoutes(app, {
    sign: (input) => signDevToken(SECRET, input),
    grants,
    documents: new DocumentsRepo(db),
    layers: new LayersRepo(db),
    visitors: new GrantVisitorsRepo(db),
    handles: new VisitorHandles(SECRET),
    deleteLayer: async () => undefined,
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

function createGrant(fx: Fixture, extra: { passphraseHash?: string } = {}): Promise<GrantRow> {
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
    url: '/v1/grant-sessions',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    payload: body,
    ...(opts.ip ? { remoteAddress: opts.ip } : {}),
  });
  return { statusCode: res.statusCode, json: () => res.json(), headers: res.headers };
}

describe('grant exchange rate limiting', () => {
  let fx: Fixture | undefined;

  afterEach(async () => {
    await fx?.close();
    fx = undefined;
  });

  test('per-grant attempts are consumed before the grant row is read', async () => {
    fx = await makeFixture({ grantAttemptLimit: { maxAttempts: 2, windowMs: 60_000 } });
    const grant = await createGrant(fx);
    const baseline = fx.grants.findByIdCalls;

    expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(200);
    expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(200);

    const blocked = await exchange(fx, { grant: grant.id });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('TooManyRequests');
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    // The blocked attempt performed no DB read.
    expect(fx.grants.findByIdCalls).toBe(baseline + 2);
  });

  test('stale (paused) grants cannot demand unbounded DB work', async () => {
    fx = await makeFixture({ grantAttemptLimit: { maxAttempts: 3, windowMs: 60_000 } });
    const grant = await createGrant(fx);
    await fx.grants.update(grant.id, TENANT, { disabled: true });
    const baseline = fx.grants.findByIdCalls;

    // Stale outcomes stay 404 (never a probe failure), but each one
    // consumes the token's attempt budget…
    for (let i = 0; i < 3; i++) {
      expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(404);
    }
    // …so the polling is bounded instead of a free unlimited DB loop.
    expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(429);
    expect(fx.grants.findByIdCalls).toBe(baseline + 3);
  });

  test('the passphrase prompt roundtrip consumes attempts but not probe budget', async () => {
    fx = await makeFixture({
      grantAttemptLimit: { maxAttempts: 2, windowMs: 60_000 },
      ipFailureLimit: { maxFailures: 1, windowMs: 60_000 },
    });
    const grant = await createGrant(fx, { passphraseHash: hashGrantPassphrase('s3cret') });

    // First roundtrip (no passphrase) is the normal prompt flow…
    expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(422);
    // …and did not count as a probe failure (budget is 1, so a counted
    // failure would 429 this request), so the retry succeeds…
    expect((await exchange(fx, { grant: grant.id, passphrase: 's3cret' })).statusCode).toBe(200);
    // …but both roundtrips consumed the token's attempt budget.
    expect((await exchange(fx, { grant: grant.id, passphrase: 's3cret' })).statusCode).toBe(429);
  });

  test('the per-IP attempt budget fronts everything; other sources are untouched', async () => {
    fx = await makeFixture({ ipAttemptLimit: { maxAttempts: 3, windowMs: 60_000 } });
    const grant = await createGrant(fx);

    for (let i = 0; i < 3; i++) {
      expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(200);
    }
    // Blocked before parsing — a valid token does not help the source.
    expect((await exchange(fx, { grant: grant.id })).statusCode).toBe(429);
    // A different source proceeds.
    expect((await exchange(fx, { grant: grant.id }, { ip: '203.0.113.9' })).statusCode).toBe(200);
  });

  test('a blocked grant leaves other grants from the same IP working', async () => {
    fx = await makeFixture({ grantAttemptLimit: { maxAttempts: 1, windowMs: 60_000 } });
    const a = await createGrant(fx);
    const b = await createGrant(fx);

    expect((await exchange(fx, { grant: a.id })).statusCode).toBe(200);
    // Token A is over budget, but the block is per token — the shared
    // NAT keeps exchanging other grants.
    expect((await exchange(fx, { grant: a.id })).statusCode).toBe(429);
    expect((await exchange(fx, { grant: b.id })).statusCode).toBe(200);
  });

  test('a concurrent burst cannot overshoot the attempt budget', async () => {
    fx = await makeFixture({ grantAttemptLimit: { maxAttempts: 3, windowMs: 60_000 } });
    const grant = await createGrant(fx);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => exchange(fx!, { grant: grant.id })),
    );
    const codes = results.map((r) => r.statusCode);
    // consume() is synchronous and precedes the handler's first await,
    // so the interleaved burst admits exactly the budget.
    expect(codes.filter((c) => c === 200)).toHaveLength(3);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
  });

  test('probing unknown tokens locks the source out via the failure budget', async () => {
    fx = await makeFixture({ ipFailureLimit: { maxFailures: 2, windowMs: 60_000 } });
    const grant = await createGrant(fx);

    expect((await exchange(fx, { grant: `shr_${'A'.repeat(24)}` })).statusCode).toBe(404);
    expect((await exchange(fx, { grant: `shr_${'B'.repeat(24)}` })).statusCode).toBe(404);

    // The source is over its failure budget: locked out, valid token
    // or not, with a Retry-After to come back to.
    const blocked = await exchange(fx, { grant: grant.id });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
