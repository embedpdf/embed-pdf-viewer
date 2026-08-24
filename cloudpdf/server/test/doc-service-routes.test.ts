import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  StaticKmsKeyring,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'doc-routes-secret';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

async function buildFixture(
  opts: { poolSize?: number; maxDocsPerSlot?: number } = {},
): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'doc-routes-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'doc-routes-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: opts.poolSize ?? 2,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    maxDocsPerSlot: opts.maxDocsPerSlot,
    kms: new StaticKmsKeyring({
      keyId: 'test-password-session-kek',
      kek: Buffer.alloc(32, 7),
    }),
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return { bundle, app: bundle.app, db, baseUrl, storageRoot, cacheRoot };
}

async function tearDown(fx: Fixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

async function waitFor(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 500;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (last) throw last;
  assertion();
}

function docToken(
  tenantId: string,
  docId: string,
  opts: { layer?: string; scope?: ReadonlyArray<string>; extras?: Record<string, unknown> } = {},
): string {
  return signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: tenantId,
    doc_id: docId,
    scope: opts.scope ?? ['*'],
    ...(opts.layer ? { layer_name: opts.layer } : {}),
    jti: `jti-${randomBytes(8).toString('hex')}`,
    extras: {
      ...(opts.extras ?? {}),
      embedpdf: { unlock_key: randomBytes(32).toString('base64url') },
    },
  });
}

function adminToken(tenantId: string): string {
  return signDevToken(SECRET, { sub: 'admin-1', tenant_id: tenantId, scope: ['*'] });
}

function tenantOnlyToken(tenantId: string): string {
  return signDevToken(SECRET, { sub: 'user-1', tenant_id: tenantId });
}

/**
 * Seed a `ready` document by inserting a tenant row + documents row
 * directly + uploading the bytes. Phase 5's lifecycle service will
 * do this for us; for Phase 3 we sidestep it because the upload
 * pipeline isn't the unit under test.
 *
 * The stub worker interprets the first byte of the payload as the
 * page count, so callers can vary `pageCount` via the bytes pattern.
 */
async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: {
    pageCount?: number;
    security?: {
      encryptionState: 'unknown' | 'none' | 'encrypted' | 'unsupported';
      encryptionRequiresPassword: boolean | null;
      securityHandlerRevision?: number | null;
      pdfPermissionsBits?: number | null;
      pdfPermissionsAllAllowed?: boolean | null;
      pdfOpenedAs?: 'none' | 'user' | 'owner' | null;
    };
  } = {},
): Promise<{ sha: string; size: number }> {
  const pageCount = opts.pageCount ?? 3;
  // First byte = page count, rest = padding so we exercise the
  // materialise + transfer path with something non-trivial.
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
      ...(opts.security
        ? {
            encryption_state: opts.security.encryptionState,
            encryption_requires_password:
              opts.security.encryptionRequiresPassword === null
                ? null
                : opts.security.encryptionRequiresPassword
                  ? 1
                  : 0,
            security_handler_revision: opts.security.securityHandlerRevision ?? null,
            pdf_permissions_bits: opts.security.pdfPermissionsBits ?? null,
            pdf_permissions_all_allowed:
              opts.security.pdfPermissionsAllAllowed === undefined ||
              opts.security.pdfPermissionsAllAllowed === null
                ? null
                : opts.security.pdfPermissionsAllAllowed
                  ? 1
                  : 0,
            pdf_opened_as: opts.security.pdfOpenedAs ?? null,
            security_probed_at: now,
          }
        : {}),
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

async function setPending(fx: Fixture, tenantId: string, docId: string): Promise<void> {
  const now = Date.now();
  await fx.db
    .insertInto('tenants')
    .values({ id: tenantId, name: tenantId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: tenantId,
      state: 'pending',
      base_sha: null,
      storage_size_bytes: null,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
}

describe('Phase 3 doc routes — GET /v1/docs/:docId/head', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('returns head info for a ready doc with a doc-scoped token', async () => {
    const tenantId = 'tenant-a';
    const docId = 'docabc123';
    const seed = await seedDocument(fx, tenantId, docId, { pageCount: 7 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: docId,
      baseSha: seed.sha,
      docVersion: 1,
      state: 'ready',
      encryption: { state: 'unknown', requiresPassword: null },
      permissions: {
        known: false,
        bits: null,
        allAllowed: null,
        openedAs: null,
        securityHandlerRevision: null,
        canUpgradeToOwner: false,
      },
      access: { required: true, reasons: ['permissions-unknown'], endpoint: '/v1/access' },
    });
  });

  test('returns head from DB and schedules a worker warm hint', async () => {
    const tenantId = 'tenant-pin';
    const docId = 'docpin111';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    await waitFor(() => {
      expect(fx.bundle.baseFileCache!.stats().refcounted).toBe(1);
      expect(fx.bundle.documentService!.stats().pinnedBaseFiles).toBe(1);
    });
  });

  test('repeated head calls share the same warm open', async () => {
    const tenantId = 'tenant-cache';
    const docId = 'docccc111';
    await seedDocument(fx, tenantId, docId);
    const cache = fx.bundle.baseFileCache!;
    const events: string[] = [];
    // Re-instrument the cache to log just for this test; we need to
    // see whether the second open re-enters materialise.
    const orig = (cache as unknown as { onEvent?: (e: { kind: string }) => void }).onEvent;
    (cache as unknown as { onEvent?: (e: { kind: string }) => void }).onEvent = (e) => {
      events.push(e.kind);
      orig?.(e);
    };

    const tok = docToken(tenantId, docId);
    const r1 = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    expect(r1.status).toBe(200);
    await waitFor(() => {
      expect(events.filter((k) => k === 'materialize-start').length).toBe(1);
    });

    const r2 = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    expect(r2.status).toBe(200);
    const materializes2 = events.filter((k) => k === 'materialize-start').length;
    expect(materializes2).toBe(1);
  });

  test('accepts a tenant admin token (* scope) on doc routes (Model B)', async () => {
    const tenantId = 'tenant-x';
    const docId = 'docxxx111';
    await seedDocument(fx, tenantId, docId, { pageCount: 4 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${adminToken(tenantId)}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(docId);
  });

  test('rejects a tenant token with no scope', async () => {
    const tenantId = 'tenant-y';
    const docId = 'docyyy111';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${tenantOnlyToken(tenantId)}` },
    });
    expect(res.status).toBe(403);
  });

  test('rejects a doc token whose doc_id does not match the URL', async () => {
    const tenantId = 'tenant-z';
    await seedDocument(fx, tenantId, 'doczzz111');
    await seedDocument(fx, tenantId, 'doczzz222');

    const res = await fetch(`${fx.baseUrl}/v1/docs/doczzz111/head`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, 'doczzz222')}` },
    });
    expect(res.status).toBe(403);
  });

  test('rejects when the document belongs to a different tenant', async () => {
    await seedDocument(fx, 'tenant-owner', 'docown111');

    const res = await fetch(`${fx.baseUrl}/v1/docs/docown111/head`, {
      headers: { Authorization: `Bearer ${docToken('tenant-attacker', 'docown111')}` },
    });
    expect(res.status).toBe(403);
  });

  test('returns DocOpenFailed for a pending document', async () => {
    const tenantId = 'tenant-pend';
    const docId = 'docpend111';
    await setPending(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('DocOpenFailed');
  });

  test('returns 404 for a non-existent document', async () => {
    const tenantId = 'tenant-q';
    await fx.db.insertInto('tenants').values({ id: tenantId, name: tenantId }).execute();

    const res = await fetch(`${fx.baseUrl}/v1/docs/nodoc111/head`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, 'nodoc111')}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('Phase 3 doc routes — GET /v1/docs/:docId/manifest@dN', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('returns the page list for the current doc version', async () => {
    const tenantId = 'tenant-m';
    const docId = 'docmmm111';
    await seedDocument(fx, tenantId, docId, { pageCount: 4 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      docVersion: number;
      pages: Array<{
        state: { weakAnnotationState: { kind: string; hasAnyWeakAnnotations: boolean } };
        cache: { contentVersion: number; annotationVersion: number };
      }>;
    };
    expect(body.docVersion).toBe(1);
    expect(body.pages).toHaveLength(4);
    for (const page of body.pages) {
      expect(page.cache.contentVersion).toBe(1);
      expect(page.cache.annotationVersion).toBe(1);
      expect(page.state.weakAnnotationState).toEqual({
        kind: 'known',
        hasAnyWeakAnnotations: false,
      });
    }
  });

  test('returns 404 when the requested structure version is stale', async () => {
    const tenantId = 'tenant-stale';
    const docId = 'docstal111';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=2`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('rejects non-numeric structure version', async () => {
    const tenantId = 'tenant-bad';
    const docId = 'docbad1111';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=XX`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(400);
  });
});

describe('Phase 3 doc routes — POST /v1/warm', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('pre-populates the head cache so the user request is warm', async () => {
    const tenantId = 'tenant-warm';
    const docId = 'docwrm111';
    await seedDocument(fx, tenantId, docId);
    const cache = fx.bundle.baseFileCache!;
    const events: string[] = [];
    (cache as unknown as { onEvent?: (e: { kind: string }) => void }).onEvent = (e) =>
      events.push(e.kind);

    const tok = docToken(tenantId, docId);
    const warmRes = await fetch(`${fx.baseUrl}/v1/warm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(warmRes.status).toBe(200);
    const materializesAfterWarm = events.filter((k) => k === 'materialize-start').length;
    expect(materializesAfterWarm).toBe(1);

    const headRes = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    expect(headRes.status).toBe(200);
    const materializesAfterHead = events.filter((k) => k === 'materialize-start').length;
    expect(materializesAfterHead).toBe(1);
  });

  test('requires a docId in the body', async () => {
    const tenantId = 'tenant-no-body';
    const docId = 'docnob111';
    await seedDocument(fx, tenantId, docId);
    const res = await fetch(`${fx.baseUrl}/v1/warm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('rejects a warm for a doc the token does not grant access to', async () => {
    const tenantId = 'tenant-warm-bad';
    await seedDocument(fx, tenantId, 'docwbd111');
    await seedDocument(fx, tenantId, 'docwbd222');

    const res = await fetch(`${fx.baseUrl}/v1/warm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, 'docwbd111')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId: 'docwbd222' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('Phase 6 access route — POST /v1/access', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('returns shared security state and none-CDN access info', async () => {
    const tenantId = 'tenant-access';
    const docId = 'docacc111';
    await seedDocument(fx, tenantId, docId, {
      security: {
        encryptionState: 'none',
        encryptionRequiresPassword: false,
        pdfPermissionsBits: 0xfffffffc,
        pdfPermissionsAllAllowed: true,
        pdfOpenedAs: 'none',
      },
    });

    const res = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, {
          layer: 'default',
          scope: ['doc.open', 'doc.render', 'doc.download'],
          extras: {
            user_id: '44',
            group_id: '4',
            groups: ['4', 'engineering'],
            display_name: 'Alice Example',
          },
        })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId, layerName: 'default' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      security: { encryption: { state: string }; permissions: { known: boolean } };
      cdn: { adapter: string; cache: { immutableVersionedReads: boolean } };
      scope: string[];
      identity: { user_id?: string; group_id?: string; groups?: string[]; display_name?: string };
    };
    expect(body.security.encryption.state).toBe('none');
    expect(body.security.permissions.known).toBe(true);
    expect(body.cdn).toMatchObject({
      adapter: 'none',
      cache: { immutableVersionedReads: true },
    });
    expect(body.scope).toEqual(['doc.open', 'doc.render', 'doc.download']);
    expect(body.identity).toEqual({
      user_id: '44',
      group_id: '4',
      groups: ['4', 'engineering'],
      display_name: 'Alice Example',
    });
  });

  test('encrypted access stores SQLite-safe verification and password session rows', async () => {
    const tenantId = 'tenant-access-cache';
    const docId = 'docacc222';
    await seedDocument(fx, tenantId, docId, {
      security: {
        encryptionState: 'encrypted',
        encryptionRequiresPassword: true,
        securityHandlerRevision: 6,
        pdfPermissionsBits: null,
        pdfPermissionsAllAllowed: null,
        pdfOpenedAs: null,
      },
    });
    const token = docToken(tenantId, docId, { layer: 'default' });
    const body = { docId, layerName: 'default', password: 'Test', mode: 'any' };

    const first = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(first.status, await first.clone().text()).toBe(200);

    const second = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(second.status).toBe(200);

    const rows = await fx.db.selectFrom('pdf_password_verifications').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pdf_permissions_all_allowed).toBe(0);

    const sessions = await fx.db.selectFrom('pdf_password_sessions').selectAll().execute();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.opened_as).toBe('user');
  });

  test('encrypted versioned reads require an active password session', async () => {
    const tenantId = 'tenant-access-read';
    const docId = 'docacc333';
    await seedDocument(fx, tenantId, docId, {
      security: {
        encryptionState: 'encrypted',
        encryptionRequiresPassword: true,
        securityHandlerRevision: 6,
        pdfPermissionsBits: null,
        pdfPermissionsAllAllowed: null,
        pdfOpenedAs: null,
      },
    });
    const token = docToken(tenantId, docId, { layer: 'default' });

    const blocked = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(blocked.status).toBe(422);
    const blockedBody = (await blocked.json()) as { error?: { code?: string } };
    expect(blockedBody.error?.code).toBe('DocPasswordRequired');

    const access = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId, layerName: 'default', password: 'Test', mode: 'any' }),
    });
    expect(access.status, await access.clone().text()).toBe(200);

    const allowed = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(allowed.status).toBe(200);
  });

  test('encrypted annotation reads carry the full JWT context into the session gate', async () => {
    const tenantId = 'tenant-access-annotations';
    const docId = 'docacc444';
    await seedDocument(fx, tenantId, docId, {
      security: {
        encryptionState: 'encrypted',
        encryptionRequiresPassword: true,
        securityHandlerRevision: 6,
        pdfPermissionsBits: null,
        pdfPermissionsAllAllowed: null,
        pdfOpenedAs: null,
      },
    });
    const token = docToken(tenantId, docId, { layer: 'default' });
    const annotationsUrl = `${fx.baseUrl}/v1/docs/${docId}/layers/default/annotations/pages/1/items`;

    const blocked = await fetch(annotationsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(blocked.status).toBe(422);
    const blockedBody = (await blocked.json()) as { error?: { code?: string } };
    expect(blockedBody.error?.code).toBe('DocPasswordRequired');

    const access = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId, layerName: 'default', password: 'Test', mode: 'any' }),
    });
    expect(access.status, await access.clone().text()).toBe(200);

    const allowed = await fetch(annotationsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(allowed.status, await allowed.clone().text()).toBe(200);
  });
});

describe('Phase 6 access route — owner-password upgrade (permission-only encrypted)', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  // A permission-only encrypted PDF: owner password set, empty user
  // password, so it opens anonymously at restricted user bits. The stub
  // worker maps password 'owner' -> owner bits (0xfffffffc, copy allowed)
  // and any other password -> user bits (0xfffff0c0, copy denied).
  const PERMISSION_ONLY = {
    encryptionState: 'encrypted' as const,
    encryptionRequiresPassword: false,
    securityHandlerRevision: 6,
    pdfPermissionsBits: 0xfffff0c0,
    pdfPermissionsAllAllowed: false,
    pdfOpenedAs: 'user' as const,
  };

  async function postAccess(
    docId: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, layerName: 'default', ...body }),
    });
  }

  test('owner password upgrades permissions, persists a session, and elevated bits stick on later reads', async () => {
    const tenantId = 'tenant-perm-owner';
    const docId = 'docperm001';
    await seedDocument(fx, tenantId, docId, { security: PERMISSION_ONLY });
    // Doc-scoped token whose only doc capability comes from expanding
    // pdf.permissions against the document's bits — so page-text access
    // tracks the effective (post-unlock) bits exactly.
    const token = docToken(tenantId, docId, { layer: 'default', scope: ['pdf.permissions'] });
    const textUrl = `${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data`;

    // Before unlock: user bits lack copy (bit 5) -> page-text denied.
    const before = await fetch(textUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(before.status).toBe(403);

    const access = await postAccess(docId, token, { password: 'owner', mode: 'any' });
    expect(access.status, await access.clone().text()).toBe(200);
    const body = (await access.json()) as {
      pdfPermissions: { openedAs: string; allAllowed: boolean };
    };
    expect(body.pdfPermissions.openedAs).toBe('owner');
    expect(body.pdfPermissions.allAllowed).toBe(true);

    // Session + verification persisted as owner.
    const sessions = await fx.db.selectFrom('pdf_password_sessions').selectAll().execute();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.opened_as).toBe('owner');
    const verifications = await fx.db
      .selectFrom('pdf_password_verifications')
      .selectAll()
      .execute();
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.opened_as).toBe('owner');

    // After unlock: the same token now resolves owner bits via the active
    // session -> page-text allowed.
    const after = await fetch(textUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(after.status, await after.clone().text()).toBe(200);
  });

  test('mode "owner" with a non-owner password is rejected', async () => {
    const tenantId = 'tenant-perm-mode';
    const docId = 'docperm002';
    await seedDocument(fx, tenantId, docId, { security: PERMISSION_ONLY });
    const token = docToken(tenantId, docId, { layer: 'default' });

    const res = await postAccess(docId, token, { password: 'not-the-owner', mode: 'owner' });
    expect(res.status).toBe(422);
    const resBody = (await res.json()) as { error?: { code?: string } };
    expect(resBody.error?.code).toBe('DocPasswordIncorrect');
  });

  test('a cached owner verification lets a wrong password be rejected without the worker', async () => {
    const tenantId = 'tenant-perm-reject';
    const docId = 'docperm003';
    await seedDocument(fx, tenantId, docId, { security: PERMISSION_ONLY });
    const token = docToken(tenantId, docId, { layer: 'default' });

    // Seed the cache with the owner verification + an owner session.
    const first = await postAccess(docId, token, { password: 'owner', mode: 'any' });
    expect(first.status, await first.clone().text()).toBe(200);
    const afterOwner = await fx.db.selectFrom('pdf_password_verifications').selectAll().execute();
    expect(afterOwner).toHaveLength(1);

    // user password is empty (requiresPassword=false) and owner is cached,
    // so a non-matching password is provably wrong: rejected WITHOUT the
    // worker. The stub would otherwise return 'user' facts and write a new
    // verification row + downgrade the session, so we assert neither happens.
    const wrong = await postAccess(docId, token, { password: 'definitely-wrong', mode: 'any' });
    expect(wrong.status).toBe(422);
    const wrongBody = (await wrong.json()) as { error?: { code?: string } };
    expect(wrongBody.error?.code).toBe('DocPasswordIncorrect');

    const verifications = await fx.db
      .selectFrom('pdf_password_verifications')
      .selectAll()
      .execute();
    expect(verifications).toHaveLength(1);
    const sessions = await fx.db.selectFrom('pdf_password_sessions').selectAll().execute();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.opened_as).toBe('owner');
  });

  test('with both user and owner passwords cached, a third password is rejected without the worker', async () => {
    const tenantId = 'tenant-perm-both';
    const docId = 'docperm004';
    await seedDocument(fx, tenantId, docId, {
      security: {
        encryptionState: 'encrypted',
        encryptionRequiresPassword: true,
        securityHandlerRevision: 6,
        pdfPermissionsBits: null,
        pdfPermissionsAllAllowed: null,
        pdfOpenedAs: null,
      },
    });
    const token = docToken(tenantId, docId, { layer: 'default' });

    // Cache both passwords (stub: 'owner' -> owner, anything else -> user).
    expect((await postAccess(docId, token, { password: 'owner', mode: 'any' })).status).toBe(200);
    expect((await postAccess(docId, token, { password: 'the-user-pw', mode: 'any' })).status).toBe(
      200,
    );
    const cached = await fx.db.selectFrom('pdf_password_verifications').selectAll().execute();
    expect(cached).toHaveLength(2);
    expect(new Set(cached.map((r) => r.opened_as))).toEqual(new Set(['owner', 'user']));

    // Both passwords known -> a third is provably wrong, rejected without
    // the worker (no new verification row).
    const third = await postAccess(docId, token, { password: 'third-password', mode: 'any' });
    expect(third.status).toBe(422);
    const stillCached = await fx.db.selectFrom('pdf_password_verifications').selectAll().execute();
    expect(stillCached).toHaveLength(2);
  });

  test('a no-password, no-grant /access downgrades by revoking the active owner session', async () => {
    const tenantId = 'tenant-perm-downgrade';
    const docId = 'docperm005';
    await seedDocument(fx, tenantId, docId, { security: PERMISSION_ONLY });
    const token = docToken(tenantId, docId, { layer: 'default', scope: ['pdf.permissions'] });
    const textUrl = `${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data`;

    // Elevate to owner; page-text becomes readable.
    const elevate = await postAccess(docId, token, { password: 'owner', mode: 'any' });
    expect(elevate.status, await elevate.clone().text()).toBe(200);
    expect((await fetch(textUrl, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(
      200,
    );
    expect(await fx.db.selectFrom('pdf_password_sessions').selectAll().execute()).toHaveLength(1);

    // No password + no grant -> downgrade. Response reports anonymous bits
    // and the session is revoked so enforcement matches.
    const downgrade = await postAccess(docId, token, {});
    expect(downgrade.status, await downgrade.clone().text()).toBe(200);
    const body = (await downgrade.json()) as {
      pdfPermissions: { openedAs: string; allAllowed: boolean };
    };
    expect(body.pdfPermissions.openedAs).not.toBe('owner');
    expect(body.pdfPermissions.allAllowed).toBe(false);
    expect(await fx.db.selectFrom('pdf_password_sessions').selectAll().execute()).toHaveLength(0);

    // Enforcement now matches: page-text is denied again.
    const after = await fetch(textUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(after.status).toBe(403);
  });

  test('a no-password /access that presents the passwordGrant renews and stays elevated', async () => {
    const tenantId = 'tenant-perm-renew';
    const docId = 'docperm006';
    await seedDocument(fx, tenantId, docId, { security: PERMISSION_ONLY });
    const token = docToken(tenantId, docId, { layer: 'default', scope: ['pdf.permissions'] });
    const textUrl = `${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data`;

    const elevate = await postAccess(docId, token, { password: 'owner', mode: 'any' });
    expect(elevate.status, await elevate.clone().text()).toBe(200);
    const { passwordGrant } = (await elevate.json()) as { passwordGrant: string | null };
    expect(passwordGrant).toBeTruthy();

    // No password but a valid grant -> renew (NOT downgrade). Session
    // persists and page-text stays readable.
    const renew = await postAccess(docId, token, { passwordGrant });
    expect(renew.status, await renew.clone().text()).toBe(200);
    const body = (await renew.json()) as {
      pdfPermissions: { openedAs: string; allAllowed: boolean };
    };
    expect(body.pdfPermissions.openedAs).toBe('owner');
    expect(await fx.db.selectFrom('pdf_password_sessions').selectAll().execute()).toHaveLength(1);

    const after = await fetch(textUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(after.status, await after.clone().text()).toBe(200);
  });
});

describe('Phase 3 doc routes — concurrency', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('concurrent /head calls share one warm open', async () => {
    const tenantId = 'tenant-concurrent';
    const docId = 'doccon1111';
    await seedDocument(fx, tenantId, docId);
    const cache = fx.bundle.baseFileCache!;
    const events: string[] = [];
    (cache as unknown as { onEvent?: (e: { kind: string }) => void }).onEvent = (e) =>
      events.push(e.kind);

    const tok = docToken(tenantId, docId);
    const responses = await Promise.all(
      Array.from({ length: 16 }, () =>
        fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
          headers: { Authorization: `Bearer ${tok}` },
        }),
      ),
    );
    for (const r of responses) expect(r.status).toBe(200);
    await waitFor(() => {
      expect(events.filter((k) => k === 'materialize-start').length).toBe(1);
    });
  });

  test('pool eviction releases the pinned base-file handle', async () => {
    await tearDown(fx);
    fx = await buildFixture({ poolSize: 1, maxDocsPerSlot: 1 });

    const tenantId = 'tenant-evict';
    const docA = 'doceva111';
    const docB = 'docevb222';
    await seedDocument(fx, tenantId, docA, { pageCount: 1 });
    await seedDocument(fx, tenantId, docB, { pageCount: 2 });

    const resA = await fetch(`${fx.baseUrl}/v1/docs/${docA}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docA)}` },
    });
    expect(resA.status).toBe(200);
    expect(fx.bundle.baseFileCache!.stats().refcounted).toBe(1);

    const resB = await fetch(`${fx.baseUrl}/v1/docs/${docB}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docB)}` },
    });
    expect(resB.status).toBe(200);

    expect(fx.bundle.baseFileCache!.stats().refcounted).toBe(1);
    expect(fx.bundle.documentService!.stats().openHeads).toBe(1);
  });
});
