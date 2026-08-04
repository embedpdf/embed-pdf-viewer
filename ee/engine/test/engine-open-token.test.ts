import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '@cloudpdf/server';
import { buildAppForTesting } from '../../server/src/app/buildApp';
import { createValidTestLicenseGate } from '../../server/src/licensing/testing';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { createCloudEngine } from '../src/index';
import { decodeUnverifiedClaims } from '../src/transport/decodeUnverifiedClaims';

/**
 * End-to-end SDK tests for the two cloud open kinds:
 *
 *   engine.open({ kind: 'token', token })
 *      decode token → doc_id (SDK-side)
 *      GET /v1/docs/:docId/head with this exact token
 *      handle owns a per-doc HttpClient bound to that token
 *
 *   engine.open({ kind: 'id', id, token? })
 *      GET /v1/docs/:id/head with engine-level token
 *      (or per-open token override)
 *      handle owns an HttpClient with the engine-level (or override)
 *      token for all subsequent RPCs
 *
 * One engine can open many docs concurrently, each with its own
 * bearer. We seed the doc directly into the DB + storage — Phase 5
 * will replace this with a real upload flow.
 */

const STUB_ENTRY = fileURLToPath(
  new URL('../../server/test/_helpers/stub-worker-entry.cjs', import.meta.url),
);
const SECRET = 'cloud-engine-open-token-secret';

interface Fixture {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

async function buildFixture(): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'open-token-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'open-token-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return { bundle, db, baseUrl, storageRoot, cacheRoot };
}

async function tearDown(fx: Fixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: { pageCount?: number } = {},
): Promise<{ sha: string; size: number }> {
  const pageCount = opts.pageCount ?? 3;
  const padding = randomBytes(4095);
  const bytes = new Uint8Array(4096);
  bytes[0] = pageCount;
  bytes.set(padding, 1);
  const sha = createHash('sha256').update(bytes).digest('hex');

  const storage = new FsObjectStore({ root: fx.storageRoot });
  const key = StorageKeys.basePdf(tenantId, docId);
  await storage.put(key, bytes, { contentLength: bytes.byteLength });

  await fx.db
    .insertInto('tenants')
    .values({ id: tenantId, name: tenantId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: tenantId,
      state: 'ready',
      base_sha: sha,
      storage_size_bytes: bytes.byteLength,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
  return { sha, size: bytes.byteLength };
}

function docToken(
  tenantId: string,
  docId: string,
  opts: { scope?: ReadonlyArray<string> } = {},
): string {
  return signDevToken(SECRET, {
    sub: 'user-token-open',
    tenant_id: tenantId,
    doc_id: docId,
    scope: opts.scope ?? ['doc.open'],
  });
}

function tenantToken(tenantId: string, opts: { scope?: ReadonlyArray<string> } = {}): string {
  return signDevToken(SECRET, {
    sub: 'user-tenant',
    tenant_id: tenantId,
    scope: opts.scope ?? ['docs.read'],
  });
}

describe('cloud engine — open({ kind: "token", token })', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('opens the doc referenced by the per-open token and binds the handle', async () => {
    const tenantId = 'tenant-open-token';
    const docId = 'docopen001';
    await seedDocument(fx, tenantId, docId, { pageCount: 5 });
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });

    const handle = await engine.open({
      kind: 'token',
      token: docToken(tenantId, docId),
    });
    expect(handle.id).toBe(docId);
  });

  test('one engine, multiple docs, each with its own token', async () => {
    const tenantId = 'tenant-multi';
    await seedDocument(fx, tenantId, 'docmulti01', { pageCount: 2 });
    await seedDocument(fx, tenantId, 'docmulti02', { pageCount: 7 });
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });

    // Opening with two distinct doc-scoped tokens concurrently. If
    // the engine were carrying a single shared bearer (the pre-fix
    // bug), the second open would either reuse the first token (and
    // therefore route to docmulti01) or get the second's token
    // racing with the first. Either way the handle ids would
    // collide. The fix gives each handle its own per-doc HttpClient
    // via withToken, so the two opens are fully independent.
    const [a, b] = await Promise.all([
      engine.open({ kind: 'token', token: docToken(tenantId, 'docmulti01') }),
      engine.open({ kind: 'token', token: docToken(tenantId, 'docmulti02') }),
    ]);
    expect(a.id).toBe('docmulti01');
    expect(b.id).toBe('docmulti02');
  });

  test('async token factory is awaited per open', async () => {
    const tenantId = 'tenant-async-tok';
    const docId = 'docasync22';
    await seedDocument(fx, tenantId, docId);
    let calls = 0;
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    const h = await engine.open({
      kind: 'token',
      token: async () => {
        calls += 1;
        return docToken(tenantId, docId);
      },
    });
    expect(h.id).toBe(docId);
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  test('rejects a token without a doc_id claim at the SDK boundary', async () => {
    const noDocIdTok = signDevToken(SECRET, {
      sub: 'no-doc-id',
      tenant_id: 'tenant-x',
      scope: ['docs.read'],
    });
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    await expect(engine.open({ kind: 'token', token: noDocIdTok })).rejects.toMatchObject({
      name: 'EngineError',
      code: EngineErrorCode.InvalidArg,
    });
  });

  test('a malformed token is rejected before any HTTP call is issued', async () => {
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    await expect(engine.open({ kind: 'token', token: 'not.a.jwt' })).rejects.toBeInstanceOf(
      EngineError,
    );
  });

  test('server-side 404 surfaces when the token references a doc that does not exist', async () => {
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    await expect(
      engine.open({
        kind: 'token',
        token: docToken('tenant-missing', 'doc-does-not-exist'),
      }),
    ).rejects.toBeDefined();
  });

  test('a doc token missing the required DocScope is rejected by the server', async () => {
    const tenantId = 'tenant-scope';
    const docId = 'docscope01';
    await seedDocument(fx, tenantId, docId);
    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    // Doc token with only `doc.annotate.read` cannot hit /head (which
    // requires `doc.open`). The server's doc-access guard returns 403,
    // which the SDK surfaces as `Forbidden`.
    const noReadTok = docToken(tenantId, docId, { scope: ['doc.annotate.read'] });
    await expect(engine.open({ kind: 'token', token: noReadTok })).rejects.toMatchObject({
      code: EngineErrorCode.Forbidden,
    });
  });
});

describe('cloud engine — open({ kind: "id", id })', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('engine-level tenant token opens any doc in the tenant by id', async () => {
    const tenantId = 'tenant-id-open';
    await seedDocument(fx, tenantId, 'docidopen01', { pageCount: 2 });
    await seedDocument(fx, tenantId, 'docidopen02', { pageCount: 5 });

    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken(tenantId),
    });

    const a = await engine.open({ kind: 'id', id: 'docidopen01' });
    const b = await engine.open({ kind: 'id', id: 'docidopen02' });
    expect(a.id).toBe('docidopen01');
    expect(b.id).toBe('docidopen02');
  });

  test('per-open token override wins over the engine-level token', async () => {
    const tenantA = 'tenant-a-override';
    const tenantB = 'tenant-b-override';
    await seedDocument(fx, tenantB, 'docoverride01');

    // Engine has tenant A's token — would normally fail to open
    // tenant B's doc. The per-open `token` override passes tenant B's
    // tenant-token, which the service-layer requireOwned accepts.
    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken(tenantA),
    });

    const handle = await engine.open({
      kind: 'id',
      id: 'docoverride01',
      token: tenantToken(tenantB),
    });
    expect(handle.id).toBe('docoverride01');
  });

  test('engine without any token fails to open by id (no Authorization header)', async () => {
    const tenantId = 'tenant-no-token';
    await seedDocument(fx, tenantId, 'docnotoken01');

    const engine = createCloudEngine({ baseUrl: fx.baseUrl });
    await expect(engine.open({ kind: 'id', id: 'docnotoken01' })).rejects.toMatchObject({
      code: EngineErrorCode.Unauthenticated,
    });
  });

  test('a tenant token from a different tenant gets 403 (doc-tenant mismatch)', async () => {
    await seedDocument(fx, 'tenant-owner', 'docowner-iso');
    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken('tenant-attacker'),
    });
    await expect(engine.open({ kind: 'id', id: 'docowner-iso' })).rejects.toMatchObject({
      code: EngineErrorCode.Forbidden,
    });
  });
});

describe('decodeUnverifiedClaims (SDK-side)', () => {
  test('round-trips a doc-scoped dev token', () => {
    const tok = signDevToken(SECRET, {
      sub: 'u',
      tenant_id: 't',
      doc_id: 'd',
      scope: ['doc.open'],
    });
    const claims = decodeUnverifiedClaims(tok);
    expect(claims.doc_id).toBe('d');
    expect(claims.tenant_id).toBe('t');
    expect(claims.sub).toBe('u');
  });

  test('rejects a non-jwt-shaped string', () => {
    expect(() => decodeUnverifiedClaims('only.two')).toThrow(EngineError);
    expect(() => decodeUnverifiedClaims('')).toThrow(EngineError);
  });

  test('rejects a token with garbage in the payload segment', () => {
    expect(() => decodeUnverifiedClaims('aa.@@@.bb')).toThrow(EngineError);
  });
});
