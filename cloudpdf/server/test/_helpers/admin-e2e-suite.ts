import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  DocumentsRepo,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../../src/index';
import { buildAppForTesting } from '../../src/app/buildApp';
import { createCloudAdmin, AdminError } from './sdk-admin-adapter';
import { createValidTestLicenseGate } from '../../src/licensing/testing';

const SECRET = 'admin-e2e-secret';
const API_TOKEN = 'admin-e2e-root-api-token';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  store: FsObjectStore;
  baseUrl: string;
  storageRoot: string;
}

export interface AdminE2eDialectFixture {
  label: string;
  /**
   * Build a fresh, migrated Kysely instance for this fixture. Each
   * fixture builds its own pristine DB; tests inside a `describe`
   * share one DB (so we mirror the original test's setup/teardown).
   */
  makeDb: () => Promise<Kysely<DbSchema>>;
  destroyDb: (db: Kysely<DbSchema>) => Promise<void>;
}

/**
 * Admin E2E suite, dialect-parameterized.
 *
 * `admin-documents.test.ts` runs it on SQLite and
 * `admin-documents-postgres.test.ts` on Postgres; the goal is to
 * **prove** the admin surface works identically on Postgres without
 * any source-code branch. If
 * the SQLite suite passes and the PG suite fails, the dialect
 * abstraction is broken.
 */
export function runAdminE2e(dialect: AdminE2eDialectFixture): void {
  async function buildFixture(
    opts: { sweepIntervalMs?: number; deletingGraceMs?: number; enableRevocation?: boolean } = {},
  ): Promise<Fixture> {
    const storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-admin-e2e-'));
    const db = await dialect.makeDb();
    const store = new FsObjectStore({ root: storageRoot });

    const bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: SECRET },
      apiAuthTokens: [API_TOKEN],
      workerEntry: null,
      db,
      objectStore: store,
      autoProvisionTenant: true,
      sweepIntervalMs: opts.sweepIntervalMs ?? 0,
      pendingTtlMs: 100,
      ...(opts.deletingGraceMs !== undefined ? { deletingGraceMs: opts.deletingGraceMs } : {}),
      ...(opts.enableRevocation ? { enableRevocation: true } : {}),
    });
    const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
    const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
    return { bundle, app: bundle.app, db, store, baseUrl, storageRoot };
  }

  async function tearDown(fx: Fixture | undefined): Promise<void> {
    if (!fx) return;
    await fx.bundle.shutdown();
    await dialect.destroyDb(fx.db);
    await rm(fx.storageRoot, { recursive: true, force: true });
  }

  function adminToken(
    tenantId: string,
    opts: {
      scope?: (
        | '*'
        | 'docs.create'
        | 'docs.read'
        | 'docs.update'
        | 'docs.delete'
        | 'tokens.issue-doc'
        | 'tokens.revoke'
      )[];
    } = {},
  ): string {
    return signDevToken(SECRET, {
      sub: `admin-${tenantId}`,
      tenant_id: tenantId,
      scope: opts.scope ?? ['*'],
    });
  }

  async function failureOf(promise: Promise<unknown>): Promise<AdminError | undefined> {
    try {
      await promise;
      return undefined;
    } catch (e) {
      return e as AdminError;
    }
  }

  const detailsOf = (err: AdminError | undefined) =>
    (err?.body as { error?: { details?: Record<string, unknown> } } | undefined)?.error?.details;

  /** Poll until `check` holds; deletes finish in the background. */
  async function eventually(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('condition did not hold in time');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  function fakePdf(seed: number, size: number): Uint8Array {
    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i++) arr[i] = (i * 31 + seed * 7) & 0xff;
    return arr;
  }

  function sha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  describe(`Admin documents E2E [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture();
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    test('documents.create -> ready, with sha verified server-side and bytes round-tripping', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-a'),
      }).tenant('tenant-a');
      const bytes = fakePdf(1, 4096);

      let progressMax = 0;
      const result = await admin.documents.create({
        bytes,
        metadata: { name: 'Q1 Report' },
        onProgress: (loaded) => {
          progressMax = Math.max(progressMax, loaded);
        },
      });

      expect(result.tag).toBe('created');
      expect(result.document.state).toBe('ready');
      expect(result.document.baseSha).toBe(sha256Hex(bytes));
      expect(result.document.metadata).toEqual({ name: 'Q1 Report' });
      expect(progressMax).toBe(bytes.byteLength);

      const back = await admin.documents.download(result.document.id);
      expect(back.byteLength).toBe(bytes.byteLength);
      expect(sha256Hex(back)).toBe(result.document.baseSha);

      const page = await admin.documents.list();
      expect(page.documents.find((d) => d.id === result.document.id)).toBeTruthy();
    });

    test('idempotency-key returns the same doc on retry without re-uploading', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-idemp'),
      }).tenant('tenant-idemp');
      const bytes = fakePdf(2, 2048);
      const key = 'retry-1';

      const first = await admin.documents.create({ bytes, idempotencyKey: key });
      expect(first.tag).toBe('created');

      const second = await admin.documents.create({ bytes, idempotencyKey: key });
      expect(second.tag).toBe('deduped');
      expect(second.document.id).toBe(first.document.id);
    });

    test('idempotency-key cannot be reused for different content', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-idemp-intent'),
      }).tenant('tenant-idemp-intent');
      const key = 'pinned-intent';

      await admin.documents.create({ bytes: fakePdf(20, 1024), idempotencyKey: key });

      await expect(
        admin.documents.create({ bytes: fakePdf(21, 1024), idempotencyKey: key }),
      ).rejects.toMatchObject({ status: 409 });
    });

    test('an explicit docId collision is a 409 with guidance, never a raw 500', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-dup-id'),
      }).tenant('tenant-dup-id');
      const docId = 'dup-doc-1';
      await admin.documents.create({ bytes: fakePdf(30, 1024), docId });

      // Naive retry: same docId, no idempotency key.
      await expect(
        admin.documents.create({ bytes: fakePdf(30, 1024), docId }),
      ).rejects.toMatchObject({ status: 409 });

      // The classic client mistake: a fresh key per attempt. Still a
      // clean 409 — the key lookup misses, the pkey collision must not
      // escape as a driver error.
      await expect(
        admin.documents.create({ bytes: fakePdf(30, 1024), docId, idempotencyKey: 'attempt-2' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    test('a docId owned by another tenant answers 403 on create', async () => {
      const a = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-dup-a'),
      }).tenant('tenant-dup-a');
      const b = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-dup-b'),
      }).tenant('tenant-dup-b');
      const docId = 'cross-tenant-doc-1';
      await a.documents.create({ bytes: fakePdf(31, 1024), docId });
      await expect(b.documents.create({ bytes: fakePdf(32, 1024), docId })).rejects.toMatchObject({
        status: 403,
      });
    });

    test('dedupMode reuse-existing returns the prior doc when content sha matches', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-dedup'),
      }).tenant('tenant-dedup');
      const bytes = fakePdf(3, 1024);
      const first = await admin.documents.create({ bytes });
      const second = await admin.documents.create({ bytes, dedupMode: 'reuse-existing' });
      expect(second.tag).toBe('deduped');
      expect(second.document.id).toBe(first.document.id);

      const third = await admin.documents.create({ bytes });
      expect(third.tag).toBe('created');
      expect(third.document.id).not.toBe(first.document.id);
    });

    test('sha mismatch at commit marks doc failed and returns 400', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-shamm'),
      }).tenant('tenant-shamm');
      const bytes = fakePdf(4, 512);
      const declaredButWrongSha = 'f'.repeat(64);

      const init = await admin.documents.init({
        contentLength: bytes.byteLength,
        contentSha256: declaredButWrongSha,
      });
      if (init.tag === 'deduped') throw new Error('unexpected dedup');
      expect(init.upload.kind).toBe('proxy');

      await admin.documents.uploadProxy({
        docId: init.document.id,
        body: bytes,
      });

      await expect(
        admin.documents.commit({ docId: init.document.id, sha256: declaredButWrongSha }),
      ).rejects.toThrow(/sha_mismatch/);

      const after = await admin.documents.get(init.document.id);
      expect(after.state).toBe('failed');
      expect(after.failureReason).toBe('sha_mismatch');
    });

    test('proxy rejects bytes that do not match the size pinned at init', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-size-intent'),
      }).tenant('tenant-size-intent');
      const bytes = fakePdf(22, 600);
      const init = await admin.documents.init({
        contentLength: bytes.byteLength + 1,
        contentSha256: sha256Hex(bytes),
      });
      if (init.tag === 'deduped') throw new Error('unexpected dedup');

      await expect(
        admin.documents.uploadProxy({ docId: init.document.id, body: bytes }),
      ).rejects.toMatchObject({ status: 400 });
    });

    test('tenant isolation: tenant B cannot read or delete tenant A docs', async () => {
      const adminA = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-iso-a'),
      }).tenant('tenant-iso-a');
      const adminB = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-iso-b'),
      }).tenant('tenant-iso-b');
      const doc = await adminA.documents.create({ bytes: fakePdf(5, 256) });

      const pageB = await adminB.documents.list();
      expect(pageB.documents.find((d) => d.id === doc.document.id)).toBeUndefined();

      let err: AdminError | undefined;
      try {
        await adminB.documents.get(doc.document.id);
      } catch (e) {
        err = e as AdminError;
      }
      expect(err).toBeInstanceOf(AdminError);
      expect(err!.status).toBe(403);

      let delErr: AdminError | undefined;
      try {
        await adminB.documents.delete(doc.document.id);
      } catch (e) {
        delErr = e as AdminError;
      }
      expect(delErr?.status).toBe(403);
      const stillThere = await adminA.documents.get(doc.document.id);
      expect(stillThere.state).toBe('ready');
    });

    test('cascade delete removes DB row + storage bytes', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-del'),
      }).tenant('tenant-del');
      const doc = await admin.documents.create({ bytes: fakePdf(6, 1500) });
      const key = StorageKeys.basePdf(doc.document.tenantId, doc.document.id);
      expect(await fx.store.stat(key)).not.toBeNull();

      await admin.documents.delete(doc.document.id);
      expect(await fx.store.stat(key)).toBeNull();

      let err: AdminError | undefined;
      try {
        await admin.documents.get(doc.document.id);
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(404);
    });

    test('non-admin token is rejected by admin routes', async () => {
      const nonAdmin = signDevToken(SECRET, { sub: 'engine-user', tenant_id: 'tenant-x' });
      const admin = createCloudAdmin({ baseUrl: fx.baseUrl, tenantToken: nonAdmin }).tenant(
        'tenant-x',
      );
      let err: AdminError | undefined;
      try {
        await admin.documents.list();
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(403);
    });

    test('api token reaches any tenant; tenant JWT is pinned to its path subtree', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const a = await root.tenant('tenant-root-a').documents.create({ bytes: fakePdf(90, 256) });
      const b = await root.tenant('tenant-root-b').documents.create({ bytes: fakePdf(91, 257) });
      expect(a.document.tenantId).toBe('tenant-root-a');
      expect(b.document.tenantId).toBe('tenant-root-b');

      // A tenant JWT for tenant-root-a addressing tenant-root-b's subtree
      // is a clear 403 — the one-rule model's mismatch case.
      const cross = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-root-a'),
      }).tenant('tenant-root-b');
      let err: AdminError | undefined;
      try {
        await cross.documents.list();
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(403);
    });

    test('deployment surface is api-token only', async () => {
      const licenseUrl = `${fx.baseUrl}/v1/deployment/license/status`;

      const withApiToken = await fetch(licenseUrl, {
        headers: { authorization: `Bearer ${API_TOKEN}` },
      });
      expect(withApiToken.status).toBe(200);
      const body = (await withApiToken.json()) as { license?: unknown };
      expect(body.license).toBeDefined();

      const withTenantJwt = await fetch(licenseUrl, {
        headers: { authorization: `Bearer ${adminToken('tenant-a')}` },
      });
      expect(withTenantJwt.status).toBe(403);
    });

    test('the original file and the thumbnail need document permissions, not docs.read', async () => {
      const tenant = 'tenant-content';
      const owner = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken(tenant),
      }).tenant(tenant);
      const doc = (await owner.documents.create({ bytes: fakePdf(90, 256) })).document;
      const keyWith = (scope: string[]) =>
        signDevToken(SECRET, { sub: `key-${scope.join('+')}`, tenant_id: tenant, scope });
      const get = (token: string, rest: string) =>
        fetch(`${fx.baseUrl}/v1/tenants/${tenant}/documents/${doc.id}${rest}`, {
          headers: { authorization: `Bearer ${token}` },
        });

      const records = keyWith(['docs.read']);
      expect((await get(records, '')).status).toBe(200);
      expect((await get(records, '/download')).status).toBe(403);
      expect((await get(records, '/thumbnail')).status).toBe(403);

      expect((await get(keyWith(['doc.download']), '/download')).status).toBe(200);
      // Allowed in, and the tile is not warmed here (no engine), so 404.
      expect((await get(keyWith(['doc.render']), '/thumbnail')).status).toBe(404);
      expect((await get(keyWith(['doc.render']), '/download')).status).toBe(403);
    });

    test('docs.read scope alone cannot create', async () => {
      const readOnly = signDevToken(SECRET, {
        sub: 'reader',
        tenant_id: 'tenant-ro',
        scope: ['docs.read'],
      });
      const admin = createCloudAdmin({ baseUrl: fx.baseUrl, tenantToken: readOnly }).tenant(
        'tenant-ro',
      );

      const page = await admin.documents.list();
      expect(Array.isArray(page.documents)).toBe(true);
      expect(page.nextCursor).toBeNull();

      let err: AdminError | undefined;
      try {
        await admin.documents.create({ bytes: fakePdf(7, 64) });
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(403);
    });
  });

  describe(`Admin documents E2E sweeper [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture({ sweepIntervalMs: 50 });
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    test('stale pending docs are reaped by the background sweeper', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-sweep'),
      }).tenant('tenant-sweep');
      const bytes = fakePdf(9, 4096);

      const init = await admin.documents.init({
        contentLength: bytes.byteLength,
        contentSha256: sha256Hex(bytes),
      });
      if (init.tag === 'deduped') throw new Error('unexpected dedup');
      expect(init.document.state).toBe('pending');

      await new Promise((r) => setTimeout(r, 400));

      let err: AdminError | undefined;
      try {
        await admin.documents.get(init.document.id);
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(404);
    });
  });

  describe(`Tenants collection [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture();
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    test('explicit create is ensure-style and marks provenance', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });

      const first = await root.tenants.create({ id: 'acme', name: 'Acme Corp' });
      expect(first.created).toBe(true);
      expect(first.tenant.id).toBe('acme');
      expect(first.tenant.name).toBe('Acme Corp');
      expect(first.tenant.autoProvisioned).toBe(false);

      const second = await root.tenants.create({ id: 'acme' });
      expect(second.created).toBe(false);
      expect(second.tenant.name).toBe('Acme Corp');
    });

    test('invalid tenant id is a 400, not a namespace', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      let err: AdminError | undefined;
      try {
        await root.tenants.create({ id: 'has spaces!' });
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(400);
    });

    test('auto-provisioned tenants carry the marker', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-auto-mark'),
      }).tenant('tenant-auto-mark');
      await admin.documents.create({ bytes: fakePdf(70, 300) });

      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const record = await root.tenants.get('tenant-auto-mark');
      expect(record.autoProvisioned).toBe(true);
    });

    test('list paginates with cursors and iterate drains it', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const ids = ['pg-a', 'pg-b', 'pg-c', 'pg-d', 'pg-e'];
      for (const id of ids) await root.tenants.create({ id });

      const firstPage = await root.tenants.list({ limit: 2 });
      expect(firstPage.tenants.length).toBe(2);
      expect(firstPage.nextCursor).not.toBeNull();

      const seen: string[] = [];
      for await (const tenant of root.tenants.iterate({ limit: 2 })) {
        seen.push(tenant.id);
      }
      for (const id of ids) expect(seen).toContain(id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    test('delete cascades: documents, stored bytes, and the tenant itself', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-cascade'),
      }).tenant('tenant-cascade');
      const doc = await admin.documents.create({ bytes: fakePdf(71, 700) });
      const key = StorageKeys.basePdf('tenant-cascade', doc.document.id);
      expect(await fx.store.stat(key)).not.toBeNull();

      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      await root.tenants.delete('tenant-cascade');

      expect(await fx.store.stat(key)).toBeNull();

      let getErr: AdminError | undefined;
      try {
        await root.tenants.get('tenant-cascade');
      } catch (e) {
        getErr = e as AdminError;
      }
      expect(getErr?.status).toBe(404);

      let docErr: AdminError | undefined;
      try {
        await root.tenant('tenant-cascade').documents.get(doc.document.id);
      } catch (e) {
        docErr = e as AdminError;
      }
      expect(docErr?.status).toBe(404);

      let delErr: AdminError | undefined;
      try {
        await root.tenants.delete('tenant-cascade');
      } catch (e) {
        delErr = e as AdminError;
      }
      expect(delErr?.status).toBe(404);
    });

    test('the collection is api-token only', async () => {
      const res = await fetch(`${fx.baseUrl}/v1/tenants`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken('tenant-a')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id: 'sneaky' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe(`Token minting [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture({ enableRevocation: true });
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    function decodeJwtPayload(token: string): Record<string, unknown> {
      const payload = token.split('.')[1]!;
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    }

    test('api token mints a tenant working credential that works end-to-end', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const issued = await root.tenant('mint-t').tokens.issueTenant({
        sub: 'billing-service',
        scope: ['docs.create', 'docs.read'],
        expiresIn: 3600,
      });

      const claims = decodeJwtPayload(issued.token);
      expect(claims['sub']).toBe('billing-service');
      expect(claims['tenant_id']).toBe('mint-t');
      expect(claims['jti']).toBe(issued.jti);
      expect(claims['exp']).toBe(issued.expiresAt);

      const delegated = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: issued.token,
      }).tenant('mint-t');
      const doc = await delegated.documents.create({ bytes: fakePdf(95, 400) });
      expect(doc.document.tenantId).toBe('mint-t');
      const page = await delegated.documents.list();
      expect(page.documents.find((d) => d.id === doc.document.id)).toBeTruthy();
    });

    test('tenant JWT with tokens.issue-doc mints doc tokens; minted token is doc-scoped', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('mint-doc-t', {
          scope: ['docs.create', 'docs.read', 'tokens.issue-doc', 'doc.open', 'doc.render'],
        }),
      }).tenant('mint-doc-t');
      const doc = await admin.documents.create({ bytes: fakePdf(96, 420) });

      const issued = await admin.tokens.issueDoc({
        sub: 'end-user-9',
        docId: doc.document.id,
        scope: ['doc.open', 'doc.render'],
        identity: { displayName: 'Jane', organization: 'Acme' },
        expiresIn: 900,
      });
      const claims = decodeJwtPayload(issued.token);
      expect(claims['doc_id']).toBe(doc.document.id);
      expect(claims['scope']).toEqual(['doc.open', 'doc.render']);
      expect(claims['identity']).toEqual({ displayName: 'Jane', organization: 'Acme' });
      expect(claims['tenant_id']).toBe('mint-doc-t');

      // A doc-scoped token is rejected on the tenant surface — proof it
      // verified and classified as doc-scoped.
      const asViewer = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: issued.token,
      }).tenant('mint-doc-t');
      let err: AdminError | undefined;
      try {
        await asViewer.documents.list();
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(403);
    });

    test('a tenant JWT mints only document permissions it holds', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const doc = await root.tenant('mint-held').documents.create({ bytes: fakePdf(99, 302) });
      // A key that can do nothing but mint viewing tokens.
      const viewing = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('mint-held', {
          scope: ['tokens.issue-doc', 'doc.open', 'doc.render', 'doc.text.search'],
        }),
      }).tenant('mint-held');

      const issued = await viewing.tokens.issueDoc({
        sub: 'reader',
        docId: doc.document.id,
        scope: ['doc.open', 'doc.render.thumbnail'],
        expiresIn: 900,
      });
      expect(decodeJwtPayload(issued.token)['scope']).toEqual(['doc.open', 'doc.render.thumbnail']);

      for (const scope of [['doc.open', 'doc.download'], ['pdf.permissions'], ['*']]) {
        let err: AdminError | undefined;
        try {
          await viewing.tokens.issueDoc({
            sub: 'reader',
            docId: doc.document.id,
            scope,
            expiresIn: 900,
          });
        } catch (e) {
          err = e as AdminError;
        }
        expect(err?.status, JSON.stringify(scope)).toBe(403);
      }
    });

    test('kind tenant requires the api token — a tenant JWT cannot mint tenant authority', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('mint-esc'),
      }).tenant('mint-esc');
      let err: AdminError | undefined;
      try {
        await admin.tokens.issueTenant({ sub: 'self', scope: ['*'], expiresIn: 3600 });
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(403);
    });

    test('issuing doc tokens needs tokens.issue-doc', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('mint-noscope', { scope: ['docs.read'] }),
      }).tenant('mint-noscope');
      let err: AdminError | undefined;
      try {
        await admin.tokens.issueDoc({
          sub: 'u',
          docId: 'whatever',
          scope: ['doc.open'],
          expiresIn: 900,
        });
      } catch (e) {
        err = e as AdminError;
      }
      expect(err?.status).toBe(403);
    });

    test('scope vocabulary, doc existence, tenant binding, and ttl bounds are enforced', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const mine = root.tenant('mint-checks');
      const doc = await mine.documents.create({ bytes: fakePdf(97, 300) });
      const foreign = await root
        .tenant('mint-foreign')
        .documents.create({ bytes: fakePdf(98, 301) });

      const attempts: Array<[Record<string, unknown>, number]> = [
        [{ sub: 'u', docId: doc.document.id, scope: ['doc.hack'], expiresIn: 900 }, 400],
        [{ sub: 'u', docId: 'does-not-exist', scope: ['doc.open'], expiresIn: 900 }, 404],
        [{ sub: 'u', docId: foreign.document.id, scope: ['doc.open'], expiresIn: 900 }, 403],
        [{ sub: 'u', docId: doc.document.id, scope: ['doc.open'], expiresIn: 30 }, 400],
      ];
      for (const [input, status] of attempts) {
        let err: AdminError | undefined;
        try {
          await mine.tokens.issueDoc(input as never);
        } catch (e) {
          err = e as AdminError;
        }
        expect(err?.status, JSON.stringify(input)).toBe(status);
      }
    });

    test('security_events records issuance and revocation', async () => {
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      const issued = await root.tenant('mint-audit').tokens.issueTenant({
        sub: 'audited-service',
        scope: ['docs.read'],
        expiresIn: 3600,
      });
      await root.tenant('mint-audit').tokens.revoke(issued.jti, { reason: 'test cleanup' });

      const rows = await fx.db
        .selectFrom('security_events')
        .selectAll()
        .where('tenant_id', '=', 'mint-audit')
        .orderBy('id', 'asc')
        .execute();
      expect(rows.length).toBe(2);
      expect(rows[0]!.kind).toBe('token.issued');
      expect(rows[0]!.jti).toBe(issued.jti);
      expect(rows[0]!.actor).toBe('api-token');
      expect(rows[0]!.via).toBe('api-token');
      expect(rows[1]!.kind).toBe('token.revoked');
      expect(rows[1]!.jti).toBe(issued.jti);
      expect(rows[1]!.reason).toBe('test cleanup');
    });
  });

  describe(`Admin documents list pagination [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture();
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    test('cursor walk visits every doc exactly once, even with created_at ties', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-page-tie'),
      }).tenant('tenant-page-tie');
      for (let i = 0; i < 7; i++) {
        await admin.documents.create({ bytes: fakePdf(20 + i, 300 + i) });
      }
      // Collapse every created_at to one timestamp: ordering now rides
      // entirely on the id tiebreaker, the exact case a bare
      // `ORDER BY created_at DESC` walk duplicates or drops rows on.
      await fx.db
        .updateTable('documents')
        .set({ created_at: 1_700_000_000_000 })
        .where('tenant_id', '=', 'tenant-page-tie')
        .execute();

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await admin.documents.list({ limit: 3, cursor });
        expect(page.documents.length).toBeLessThanOrEqual(3);
        seen.push(...page.documents.map((d) => d.id));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor !== undefined);

      expect(pages).toBe(3); // 3 + 3 + 1
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });

    test('pages come newest first across cursor boundaries', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-page-order'),
      }).tenant('tenant-page-order');
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const doc = await admin.documents.create({ bytes: fakePdf(40 + i, 200 + i) });
        ids.push(doc.document.id);
        // Distinct, ascending created_at so "newest first" has one answer.
        await fx.db
          .updateTable('documents')
          .set({ created_at: 1_700_000_000_000 + i * 1000 })
          .where('id', '=', doc.document.id)
          .execute();
      }

      const first = await admin.documents.list({ limit: 2 });
      expect(first.documents.map((d) => d.id)).toEqual([ids[2], ids[1]]);
      expect(first.nextCursor).not.toBeNull();

      const second = await admin.documents.list({ limit: 2, cursor: first.nextCursor! });
      expect(second.documents.map((d) => d.id)).toEqual([ids[0]]);
      expect(second.nextCursor).toBeNull();
    });

    test('out-of-range limit and malformed cursor are 400s, not silent clamps', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-page-bad'),
      }).tenant('tenant-page-bad');

      for (const limit of [0, 999]) {
        let err: AdminError | undefined;
        try {
          await admin.documents.list({ limit });
        } catch (e) {
          err = e as AdminError;
        }
        expect(err?.status).toBe(400);
      }

      for (const cursor of [
        'not-a-cursor',
        'v1.%%%%',
        `v1.${Buffer.from('[1]').toString('base64url')}`,
      ]) {
        let err: AdminError | undefined;
        try {
          await admin.documents.list({ cursor });
        } catch (e) {
          err = e as AdminError;
        }
        expect(err?.status).toBe(400);
      }
    });

    test('state filter composes with the cursor', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-page-state'),
      }).tenant('tenant-page-state');
      await admin.documents.create({ bytes: fakePdf(60, 400) });
      await admin.documents.create({ bytes: fakePdf(61, 401) });

      // Manufacture a failed doc via the sha-mismatch path.
      const bytes = fakePdf(62, 402);
      const wrongSha = 'f'.repeat(64);
      const init = await admin.documents.init({
        contentLength: bytes.byteLength,
        contentSha256: wrongSha,
      });
      if (init.tag === 'deduped') throw new Error('unexpected dedup');
      await admin.documents.uploadProxy({
        docId: init.document.id,
        body: bytes,
      });
      await expect(
        admin.documents.commit({ docId: init.document.id, sha256: wrongSha }),
      ).rejects.toThrow(/sha_mismatch/);

      const failed = await admin.documents.list({ state: 'failed' });
      expect(failed.documents.map((d) => d.id)).toEqual([init.document.id]);
      expect(failed.nextCursor).toBeNull();

      const readyFirst = await admin.documents.list({ state: 'ready', limit: 1 });
      expect(readyFirst.documents).toHaveLength(1);
      expect(readyFirst.documents[0]!.state).toBe('ready');
      expect(readyFirst.nextCursor).not.toBeNull();

      const readyRest = await admin.documents.list({
        state: 'ready',
        limit: 1,
        cursor: readyFirst.nextCursor!,
      });
      expect(readyRest.documents).toHaveLength(1);
      expect(readyRest.documents[0]!.state).toBe('ready');
      expect(readyRest.documents[0]!.id).not.toBe(readyFirst.documents[0]!.id);
      expect(readyRest.nextCursor).toBeNull();
    });

    test('iterate() drains every page lazily', async () => {
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken('tenant-page-iter'),
      }).tenant('tenant-page-iter');
      for (let i = 0; i < 5; i++) {
        await admin.documents.create({ bytes: fakePdf(80 + i, 500 + i) });
      }
      const ids: string[] = [];
      for await (const doc of admin.documents.iterate({ limit: 2 })) {
        ids.push(doc.id);
      }
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe(`Document names, search and sort [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture();
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    function tenantAdmin(
      tenantId: string,
      scope?: NonNullable<Parameters<typeof adminToken>[1]>['scope'],
    ) {
      return createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken(tenantId, scope ? { scope } : {}),
      }).tenant(tenantId);
    }

    async function statusOf(promise: Promise<unknown>): Promise<number> {
      try {
        await promise;
        return 200;
      } catch (e) {
        return (e as AdminError).status;
      }
    }

    async function walk(
      admin: ReturnType<typeof tenantAdmin>,
      options: Record<string, unknown>,
    ): Promise<string[]> {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await admin.documents.list({ ...options, limit: 2, cursor });
        ids.push(...page.documents.map((d: { id: string }) => d.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return ids;
    }

    test('a document is named at upload, or after its id', async () => {
      const admin = tenantAdmin('tenant-names-upload');
      const named = await admin.documents.create({
        bytes: fakePdf(100, 300),
        name: 'Quarterly report.pdf',
      });
      expect(named.document.name).toBe('Quarterly report.pdf');
      const unnamed = await admin.documents.create({ bytes: fakePdf(101, 300) });
      expect(unnamed.document.name).toBe(unnamed.document.id);
      expect((await admin.documents.get(named.document.id)).name).toBe('Quarterly report.pdf');
    });

    test('names a person cannot read are 400s at upload and rename', async () => {
      const admin = tenantAdmin('tenant-names-invalid');
      const bytes = fakePdf(110, 300);
      const doc = await admin.documents.create({ bytes, name: 'Valid.pdf' });
      for (const name of ['', ' leading.pdf', 'trailing.pdf ', 'tab\there.pdf', 'a'.repeat(256)]) {
        const init = admin.documents.init({
          contentLength: bytes.byteLength,
          contentSha256: sha256Hex(bytes),
          name,
        });
        expect(await statusOf(init)).toBe(400);
        expect(await statusOf(admin.documents.rename(doc.document.id, name))).toBe(400);
      }
      expect((await admin.documents.rename(doc.document.id, 'a'.repeat(255))).name).toHaveLength(
        255,
      );
      expect((await admin.documents.rename(doc.document.id, 'Überweisung März.pdf')).name).toBe(
        'Überweisung März.pdf',
      );
    });

    test('rename changes the name; gone, deleting and foreign documents are refused', async () => {
      const admin = tenantAdmin('tenant-names-rename');
      const doc = await admin.documents.create({ bytes: fakePdf(120, 300), name: 'Draft.pdf' });
      const renamed = await admin.documents.rename(doc.document.id, 'Final.pdf');
      expect(renamed.name).toBe('Final.pdf');
      expect((await admin.documents.get(doc.document.id)).name).toBe('Final.pdf');
      expect(
        (await admin.documents.list({ q: 'final' })).documents.map((d: { id: string }) => d.id),
      ).toEqual([doc.document.id]);

      expect(await statusOf(admin.documents.rename('doc_missing', 'X.pdf'))).toBe(404);
      const other = tenantAdmin('tenant-names-rename-other');
      expect(await statusOf(other.documents.rename(doc.document.id, 'Mine.pdf'))).toBe(403);

      await fx.db
        .updateTable('documents')
        .set({ state: 'deleting' })
        .where('id', '=', doc.document.id)
        .execute();
      expect(await statusOf(admin.documents.rename(doc.document.id, 'Again.pdf'))).toBe(404);
    });

    test('renaming needs docs.update', async () => {
      const owner = tenantAdmin('tenant-names-scope');
      const doc = await owner.documents.create({ bytes: fakePdf(130, 300), name: 'Before.pdf' });
      const withoutUpdate = tenantAdmin('tenant-names-scope', [
        'docs.create',
        'docs.read',
        'docs.delete',
      ]);
      expect(await statusOf(withoutUpdate.documents.rename(doc.document.id, 'After.pdf'))).toBe(
        403,
      );
      const updateOnly = tenantAdmin('tenant-names-scope', ['docs.update']);
      expect((await updateOnly.documents.rename(doc.document.id, 'After.pdf')).name).toBe(
        'After.pdf',
      );
    });

    test('search matches part of a name, ignoring case, with % and _ taken literally', async () => {
      const admin = tenantAdmin('tenant-names-search');
      const ids: Record<string, string> = {};
      for (const [i, name] of [
        'Invoice 2026.pdf',
        'invoice_final.pdf',
        'invoiceXfinal.pdf',
        'Report 100%.pdf',
        'Überweisung.pdf',
        'Contract.pdf',
      ].entries()) {
        ids[name] = (
          await admin.documents.create({ bytes: fakePdf(140 + i, 300), name })
        ).document.id;
      }
      const search = async (q: string, options: Record<string, unknown> = {}) =>
        (await admin.documents.list({ q, ...options })).documents
          .map((d: { name: string }) => d.name)
          .sort();

      expect(await search('INVOICE')).toEqual([
        'Invoice 2026.pdf',
        'invoiceXfinal.pdf',
        'invoice_final.pdf',
      ]);
      expect(await search('_')).toEqual(['invoice_final.pdf']);
      expect(await search('e_f')).toEqual(['invoice_final.pdf']);
      expect(await search('100%')).toEqual(['Report 100%.pdf']);
      expect(await search('%')).toEqual(['Report 100%.pdf']);
      expect(await search('ÜBER')).toEqual(['Überweisung.pdf']);
      expect(await search('nothing like this')).toEqual([]);

      // Search composes with the name sort and its cursor.
      expect(await walk(admin, { q: 'invoice', sort: 'name' })).toEqual([
        ids['Invoice 2026.pdf'],
        ids['invoice_final.pdf'],
        ids['invoiceXfinal.pdf'],
      ]);
    });

    test('every sort and order pages through ties in a stable order', async () => {
      const admin = tenantAdmin('tenant-names-sort');
      const specs = [
        { name: 'beta.pdf', size: 300, createdAt: 1_700_000_000_000 },
        { name: 'Alpha.pdf', size: 100, createdAt: 1_700_000_000_000 },
        { name: 'alpha.pdf', size: 300, createdAt: 1_700_000_001_000 },
        { name: 'Gamma.pdf', size: 200, createdAt: 1_700_000_002_000 },
        { name: 'beta.pdf', size: 100, createdAt: 1_700_000_002_000 },
      ];
      const docs: Array<{ id: string; name: string; size: number; createdAt: number }> = [];
      for (const [i, spec] of specs.entries()) {
        const { document } = await admin.documents.create({
          bytes: fakePdf(160 + i, spec.size),
          name: spec.name,
        });
        await fx.db
          .updateTable('documents')
          .set({ created_at: spec.createdAt })
          .where('id', '=', document.id)
          .execute();
        docs.push({ id: document.id, ...spec });
      }

      const keyOf = {
        createdAt: (d: (typeof docs)[number]) => d.createdAt,
        name: (d: (typeof docs)[number]) => d.name.toLowerCase(),
        size: (d: (typeof docs)[number]) => d.size,
      } as const;
      for (const sort of ['createdAt', 'name', 'size'] as const) {
        for (const order of ['asc', 'desc', undefined] as const) {
          const direction = order ?? (sort === 'name' ? 'asc' : 'desc');
          const sign = direction === 'asc' ? 1 : -1;
          const expected = [...docs]
            .sort((left, right) => {
              const leftKey = keyOf[sort](left);
              const rightKey = keyOf[sort](right);
              if (leftKey !== rightKey) return (leftKey < rightKey ? -1 : 1) * sign;
              return (left.id < right.id ? -1 : 1) * sign;
            })
            .map((d) => d.id);
          const options = order ? { sort, order } : { sort };
          expect(await walk(admin, options), `${sort} ${order ?? 'default'}`).toEqual(expected);
        }
      }
    });

    test('a cursor only continues the sort and order it was made with', async () => {
      const admin = tenantAdmin('tenant-names-cursor');
      for (let i = 0; i < 3; i++) {
        await admin.documents.create({ bytes: fakePdf(180 + i, 300), name: `File ${i}.pdf` });
      }
      const first = await admin.documents.list({ sort: 'name', limit: 1 });
      const cursor = first.nextCursor!;
      expect(cursor).toBeTruthy();
      expect(await statusOf(admin.documents.list({ sort: 'name', order: 'asc', cursor }))).toBe(
        200,
      );
      expect(await statusOf(admin.documents.list({ sort: 'size', cursor }))).toBe(400);
      expect(await statusOf(admin.documents.list({ sort: 'name', order: 'desc', cursor }))).toBe(
        400,
      );
      expect(await statusOf(admin.documents.list({ cursor }))).toBe(400);
    });

    test('documents being deleted are hidden unless asked for by state', async () => {
      const admin = tenantAdmin('tenant-names-deleting');
      const kept = await admin.documents.create({ bytes: fakePdf(190, 300), name: 'Kept.pdf' });
      const going = await admin.documents.create({ bytes: fakePdf(191, 300), name: 'Going.pdf' });
      await fx.db
        .updateTable('documents')
        .set({ state: 'deleting' })
        .where('id', '=', going.document.id)
        .execute();
      const ids = (page: { documents: Array<{ id: string }> }) => page.documents.map((d) => d.id);
      expect(ids(await admin.documents.list())).toEqual([kept.document.id]);
      expect(ids(await admin.documents.list({ q: 'going' }))).toEqual([]);
      expect(ids(await admin.documents.list({ state: 'deleting' }))).toEqual([going.document.id]);
    });
  });

  describe(`Folders [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture();
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    function tenantAdmin(
      tenantId: string,
      scope?: NonNullable<Parameters<typeof adminToken>[1]>['scope'],
    ) {
      return createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken(tenantId, scope ? { scope } : {}),
      }).tenant(tenantId);
    }

    test('folders are made at the top level or inside another, and listed by name', async () => {
      const admin = tenantAdmin('tenant-folders-list');
      const contracts = await admin.folders.create({ name: 'Contracts' });
      const invoices = await admin.folders.create({ name: 'invoices', parentId: 'root' });
      const year = await admin.folders.create({ name: '2026', parentId: contracts.id });
      expect(contracts.parentId).toBe('root');
      expect(year.parentId).toBe(contracts.id);
      expect(contracts.id).toMatch(/^fld_[0-9a-f]{24}$/);

      const names = (page: { folders: Array<{ name: string }> }) => page.folders.map((f) => f.name);
      expect(names(await admin.folders.list())).toEqual(['2026', 'Contracts', 'invoices']);
      expect(names(await admin.folders.list({ parentId: 'root' }))).toEqual([
        'Contracts',
        'invoices',
      ]);
      expect(names(await admin.folders.list({ parentId: contracts.id }))).toEqual(['2026']);
      expect(names(await admin.folders.list({ parentId: invoices.id }))).toEqual([]);

      const walked: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await admin.folders.list({ limit: 1, cursor });
        walked.push(...names(page));
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      expect(walked).toEqual(['2026', 'Contracts', 'invoices']);

      expect(
        (await failureOf(admin.folders.list({ parentId: 'fld_000000000000000000000000' })))?.status,
      ).toBe(404);
    });

    test('a folder comes with the path above it', async () => {
      const admin = tenantAdmin('tenant-folders-path');
      const a = await admin.folders.create({ name: 'A' });
      const b = await admin.folders.create({ name: 'B', parentId: a.id });
      const c = await admin.folders.create({ name: 'C', parentId: b.id });
      const got = await admin.folders.get(c.id);
      expect(got.folder.name).toBe('C');
      expect(got.path).toEqual([
        { id: a.id, name: 'A' },
        { id: b.id, name: 'B' },
      ]);
      expect((await admin.folders.get(a.id)).path).toEqual([]);
      expect((await failureOf(admin.folders.get('fld_000000000000000000000000')))?.status).toBe(
        404,
      );
    });

    test('sibling names are unique ignoring case, at the top level too', async () => {
      const admin = tenantAdmin('tenant-folders-names');
      const reports = await admin.folders.create({ name: 'Reports' });
      const clash = await failureOf(admin.folders.create({ name: 'reports' }));
      expect(clash?.status).toBe(409);
      expect(detailsOf(clash)).toEqual({ reason: 'name-taken', name: 'Reports' });

      const other = await admin.folders.create({ name: 'Other' });
      await admin.folders.create({ name: 'Reports', parentId: other.id });
      expect((await failureOf(admin.folders.rename(other.id, 'REPORTS')))?.status).toBe(409);
      expect((await admin.folders.rename(reports.id, 'REPORTS')).name).toBe('REPORTS');

      for (const name of ['', ' padded', 'tab\there']) {
        expect((await failureOf(admin.folders.create({ name })))?.status).toBe(400);
      }

      await admin.folders.delete(reports.id);
      expect((await admin.folders.create({ name: 'reports' })).name).toBe('reports');
    });

    test('documents are filed at upload and listed per folder', async () => {
      const admin = tenantAdmin('tenant-folders-docs');
      const folder = await admin.folders.create({ name: 'Inbox' });
      const filed = await admin.documents.create({ bytes: fakePdf(200, 300), folderId: folder.id });
      const loose = await admin.documents.create({ bytes: fakePdf(201, 300) });
      expect(filed.document.folderId).toBe(folder.id);
      expect(loose.document.folderId).toBe('root');

      const ids = (page: { documents: Array<{ id: string }> }) => page.documents.map((d) => d.id);
      expect(ids(await admin.documents.list({ folderId: folder.id }))).toEqual([filed.document.id]);
      expect(ids(await admin.documents.list({ folderId: 'root' }))).toEqual([loose.document.id]);
      expect(new Set(ids(await admin.documents.list()))).toEqual(
        new Set([filed.document.id, loose.document.id]),
      );

      const missing = 'fld_000000000000000000000000';
      expect((await failureOf(admin.documents.list({ folderId: missing })))?.status).toBe(404);
      expect(
        (await failureOf(admin.documents.create({ bytes: fakePdf(202, 300), folderId: missing })))
          ?.status,
      ).toBe(404);
      const foreign = await tenantAdmin('tenant-folders-docs-other').folders.create({
        name: 'Theirs',
      });
      expect(
        (
          await failureOf(
            admin.documents.create({ bytes: fakePdf(203, 300), folderId: foreign.id }),
          )
        )?.status,
      ).toBe(403);
    });

    test('a move takes documents and folders together, or nothing', async () => {
      const admin = tenantAdmin('tenant-folders-move');
      const a = await admin.folders.create({ name: 'A' });
      const b = await admin.folders.create({ name: 'B' });
      const doc1 = (await admin.documents.create({ bytes: fakePdf(210, 300) })).document;
      const doc2 = (await admin.documents.create({ bytes: fakePdf(211, 300) })).document;

      await admin.folders.moveInto(b.id, { documentIds: [doc1.id], folderIds: [a.id] });
      expect((await admin.folders.get(a.id)).folder.parentId).toBe(b.id);
      expect((await admin.documents.get(doc1.id)).folderId).toBe(b.id);

      await admin.folders.moveInto('root', { documentIds: [doc1.id], folderIds: [a.id] });
      expect((await admin.documents.get(doc1.id)).folderId).toBe('root');
      expect((await admin.folders.get(a.id)).folder.parentId).toBe('root');

      const missing = await failureOf(
        admin.folders.moveInto(b.id, {
          documentIds: [doc2.id, 'doc_missing'],
          folderIds: [a.id, 'fld_000000000000000000000000'],
        }),
      );
      expect(missing?.status).toBe(404);
      expect(detailsOf(missing)).toEqual({
        documentIds: ['doc_missing'],
        folderIds: ['fld_000000000000000000000000'],
      });
      expect((await admin.documents.get(doc2.id)).folderId).toBe('root');
      expect((await admin.folders.get(a.id)).folder.parentId).toBe('root');

      expect((await failureOf(admin.folders.moveInto(b.id, {})))?.status).toBe(400);
    });

    test('a folder cannot move into itself or anything inside it', async () => {
      const admin = tenantAdmin('tenant-folders-cycle');
      const a = await admin.folders.create({ name: 'A' });
      const b = await admin.folders.create({ name: 'B', parentId: a.id });
      const c = await admin.folders.create({ name: 'C', parentId: b.id });

      for (const [target, moved] of [
        [a.id, [a.id]],
        [c.id, [a.id]],
        [c.id, [b.id, c.id]],
      ] as const) {
        const err = await failureOf(admin.folders.moveInto(target, { folderIds: [...moved] }));
        expect(err?.status).toBe(409);
        expect(detailsOf(err)?.['reason']).toBe('cycle');
      }

      // A folder and its own subfolder may move together, out of each other.
      await admin.folders.moveInto(a.id, { folderIds: [b.id, c.id] });
      expect((await admin.folders.get(c.id)).folder.parentId).toBe(a.id);
      expect((await admin.folders.get(b.id)).folder.parentId).toBe(a.id);
    });

    test('a name clash fails the whole move', async () => {
      const admin = tenantAdmin('tenant-folders-move-names');
      const target = await admin.folders.create({ name: 'Target' });
      await admin.folders.create({ name: 'Same', parentId: target.id });
      const p1 = await admin.folders.create({ name: 'P1' });
      const p2 = await admin.folders.create({ name: 'P2' });
      const same = await admin.folders.create({ name: 'same', parentId: p1.id });
      const x1 = await admin.folders.create({ name: 'X', parentId: p1.id });
      const x2 = await admin.folders.create({ name: 'x', parentId: p2.id });
      const doc = (await admin.documents.create({ bytes: fakePdf(220, 300) })).document;

      const clash = await failureOf(
        admin.folders.moveInto(target.id, { documentIds: [doc.id], folderIds: [same.id] }),
      );
      expect(detailsOf(clash)).toEqual({ reason: 'name-taken', name: 'Same' });
      expect((await admin.documents.get(doc.id)).folderId).toBe('root');

      const together = await failureOf(
        admin.folders.moveInto(target.id, { folderIds: [x1.id, x2.id] }),
      );
      expect(detailsOf(together)?.['reason']).toBe('name-taken');

      // Moving a folder to where it already is clashes with nothing.
      await admin.folders.moveInto(p1.id, { folderIds: [same.id] });
    });

    test('folders nest at most 100 levels, on create and on move', async () => {
      const admin = tenantAdmin('tenant-folders-depth');
      const chain: string[] = [];
      for (let level = 1; level <= 100; level++) {
        const parentId = chain[chain.length - 1];
        chain.push(
          (await admin.folders.create({ name: `L${level}`, ...(parentId ? { parentId } : {}) })).id,
        );
      }
      const deepest = await failureOf(admin.folders.create({ name: 'L101', parentId: chain[99]! }));
      expect(detailsOf(deepest)).toEqual({ reason: 'too-deep', maxDepth: 100 });

      const x = await admin.folders.create({ name: 'X' });
      await admin.folders.create({ name: 'Y', parentId: x.id });
      const tooDeep = await failureOf(admin.folders.moveInto(chain[98]!, { folderIds: [x.id] }));
      expect(detailsOf(tooDeep)?.['reason']).toBe('too-deep');
      await admin.folders.moveInto(chain[97]!, { folderIds: [x.id] });
      expect((await admin.folders.get(x.id)).path).toHaveLength(98);
    });

    test('only an empty folder is deleted; otherwise the refusal says what it holds', async () => {
      const admin = tenantAdmin('tenant-folders-delete');
      const outer = await admin.folders.create({ name: 'Outer' });
      const inner = await admin.folders.create({ name: 'Inner', parentId: outer.id });
      const doc = (await admin.documents.create({ bytes: fakePdf(230, 300), folderId: inner.id }))
        .document;

      const full = await failureOf(admin.folders.delete(outer.id));
      expect(full?.status).toBe(409);
      expect(detailsOf(full)).toEqual({ reason: 'not-empty', folders: 1, documents: 1 });
      expect(detailsOf(await failureOf(admin.folders.delete(inner.id)))).toEqual({
        reason: 'not-empty',
        folders: 0,
        documents: 1,
      });

      // A document being deleted is in no folder, so it holds nothing back.
      await new DocumentsRepo(fx.db).beginDelete(doc.id, 'tenant-folders-delete');
      await admin.folders.delete(inner.id);
      await admin.folders.delete(outer.id);
      expect((await failureOf(admin.folders.get(outer.id)))?.status).toBe(404);
    });

    test('each folder route needs its docs scope', async () => {
      const owner = tenantAdmin('tenant-folders-scope');
      const folder = await owner.folders.create({ name: 'Scoped' });
      const doc = (await owner.documents.create({ bytes: fakePdf(240, 300) })).document;
      const readOnly = tenantAdmin('tenant-folders-scope', ['docs.read']);
      const noUpdate = tenantAdmin('tenant-folders-scope', [
        'docs.create',
        'docs.read',
        'docs.delete',
      ]);
      const noDelete = tenantAdmin('tenant-folders-scope', [
        'docs.create',
        'docs.read',
        'docs.update',
      ]);

      expect((await failureOf(readOnly.folders.create({ name: 'Nope' })))?.status).toBe(403);
      expect((await readOnly.folders.get(folder.id)).folder.name).toBe('Scoped');
      expect((await failureOf(noUpdate.folders.rename(folder.id, 'Renamed')))?.status).toBe(403);
      expect(
        (await failureOf(noUpdate.folders.moveInto(folder.id, { documentIds: [doc.id] })))?.status,
      ).toBe(403);
      expect((await failureOf(noDelete.folders.delete(folder.id)))?.status).toBe(403);
      await tenantAdmin('tenant-folders-scope', ['docs.update']).folders.moveInto(folder.id, {
        documentIds: [doc.id],
      });
      expect((await owner.documents.get(doc.id)).folderId).toBe(folder.id);
    });

    test("another tenant's folders are out of reach", async () => {
      const mine = tenantAdmin('tenant-folders-iso-a');
      const theirs = tenantAdmin('tenant-folders-iso-b');
      const folder = await mine.folders.create({ name: 'Private' });
      const doc = (await mine.documents.create({ bytes: fakePdf(250, 300) })).document;
      expect((await failureOf(theirs.folders.get(folder.id)))?.status).toBe(403);
      expect((await failureOf(theirs.folders.rename(folder.id, 'Mine')))?.status).toBe(403);
      expect((await failureOf(theirs.folders.delete(folder.id)))?.status).toBe(403);
      const target = await theirs.folders.create({ name: 'Target' });
      const moved = await failureOf(
        theirs.folders.moveInto(target.id, { documentIds: [doc.id], folderIds: [folder.id] }),
      );
      expect(moved?.status).toBe(404);
      expect(detailsOf(moved)).toEqual({ documentIds: [doc.id], folderIds: [folder.id] });
    });

    test('opposite moves at the same time never make a loop', async () => {
      const admin = tenantAdmin('tenant-folders-race');
      for (let round = 0; round < 5; round++) {
        const a = await admin.folders.create({ name: `A${round}` });
        const b = await admin.folders.create({ name: `B${round}` });
        const results = await Promise.allSettled([
          admin.folders.moveInto(b.id, { folderIds: [a.id] }),
          admin.folders.moveInto(a.id, { folderIds: [b.id] }),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(detailsOf(refused.reason as AdminError)?.['reason']).toBe('cycle');
        const parents = [
          (await admin.folders.get(a.id)).folder.parentId,
          (await admin.folders.get(b.id)).folder.parentId,
        ];
        expect(parents.filter((parent) => parent === 'root')).toHaveLength(1);
      }
    });

    test('deleting a tenant deletes its folders', async () => {
      const admin = tenantAdmin('tenant-folders-cascade');
      const outer = await admin.folders.create({ name: 'Outer' });
      const inner = await admin.folders.create({ name: 'Inner', parentId: outer.id });
      await admin.documents.create({ bytes: fakePdf(260, 300), folderId: inner.id });
      const root = createCloudAdmin({ baseUrl: fx.baseUrl, apiToken: API_TOKEN });
      await root.tenants.delete('tenant-folders-cascade');
      const left = await fx.db
        .selectFrom('folders')
        .select('id')
        .where('tenant_id', '=', 'tenant-folders-cascade')
        .execute();
      expect(left).toEqual([]);
    });
  });

  describe(`Deleting folders with what they hold [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture();
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    function tenantAdmin(
      tenantId: string,
      scope?: NonNullable<Parameters<typeof adminToken>[1]>['scope'],
    ) {
      return createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken(tenantId, scope ? { scope } : {}),
      }).tenant(tenantId);
    }

    const gone = async (admin: ReturnType<typeof tenantAdmin>, docId: string) =>
      (await failureOf(admin.documents.get(docId)))?.status === 404;

    test('a folder goes with everything under it, at once; stored files follow', async () => {
      const tenant = 'tenant-rdel-all';
      const admin = tenantAdmin(tenant);
      const a = await admin.folders.create({ name: 'A' });
      const b = await admin.folders.create({ name: 'B', parentId: a.id });
      const keep = await admin.folders.create({ name: 'Keep' });
      const inA = (await admin.documents.create({ bytes: fakePdf(300, 300), folderId: a.id }))
        .document;
      const inB = (await admin.documents.create({ bytes: fakePdf(301, 300), folderId: b.id }))
        .document;
      const kept = (await admin.documents.create({ bytes: fakePdf(302, 300), folderId: keep.id }))
        .document;

      await admin.folders.delete(a.id, { recursive: true });

      expect((await failureOf(admin.folders.get(a.id)))?.status).toBe(404);
      expect((await failureOf(admin.folders.get(b.id)))?.status).toBe(404);
      expect((await admin.documents.list()).documents.map((d: { id: string }) => d.id)).toEqual([
        kept.id,
      ]);
      expect((await admin.folders.create({ name: 'a' })).name).toBe('a');

      await eventually(async () => (await gone(admin, inA.id)) && (await gone(admin, inB.id)));
      expect(await fx.store.stat(StorageKeys.basePdf(tenant, inA.id))).toBeNull();
      expect(await fx.store.stat(StorageKeys.basePdf(tenant, inB.id))).toBeNull();
      expect((await admin.documents.get(kept.id)).state).toBe('ready');
    });

    test('a deep tree goes in one delete', async () => {
      const admin = tenantAdmin('tenant-rdel-deep');
      const chain: string[] = [];
      const docs: string[] = [];
      for (let level = 1; level <= 30; level++) {
        const parentId = chain[chain.length - 1];
        const folder = await admin.folders.create({
          name: `L${level}`,
          ...(parentId ? { parentId } : {}),
        });
        chain.push(folder.id);
        if (level % 10 === 0) {
          docs.push(
            (
              await admin.documents.create({
                bytes: fakePdf(310 + level, 300),
                folderId: folder.id,
              })
            ).document.id,
          );
        }
      }
      await admin.folders.delete(chain[0]!, { recursive: true });
      expect((await admin.folders.list()).folders).toEqual([]);
      expect((await admin.documents.list()).documents).toEqual([]);
      await eventually(async () => {
        for (const id of docs) if (!(await gone(admin, id))) return false;
        return true;
      });
    });

    test('without recursive, a folder holding anything is still refused', async () => {
      const admin = tenantAdmin('tenant-rdel-plain');
      const folder = await admin.folders.create({ name: 'Full' });
      const doc = (await admin.documents.create({ bytes: fakePdf(320, 300), folderId: folder.id }))
        .document;
      for (const options of [{}, { recursive: false }]) {
        const refused = await failureOf(admin.folders.delete(folder.id, options));
        expect(detailsOf(refused)).toEqual({ reason: 'not-empty', folders: 0, documents: 1 });
      }
      expect((await admin.documents.get(doc.id)).state).toBe('ready');
    });

    test('deleting a folder with what it holds needs docs.delete', async () => {
      const owner = tenantAdmin('tenant-rdel-scope');
      const folder = await owner.folders.create({ name: 'Scoped' });
      await owner.documents.create({ bytes: fakePdf(330, 300), folderId: folder.id });
      const noDelete = tenantAdmin('tenant-rdel-scope', [
        'docs.create',
        'docs.read',
        'docs.update',
      ]);
      expect(
        (await failureOf(noDelete.folders.delete(folder.id, { recursive: true })))?.status,
      ).toBe(403);
      expect((await owner.folders.get(folder.id)).folder.name).toBe('Scoped');
    });

    test('an upload into a deleted folder cannot finish, and nothing moves into it', async () => {
      const admin = tenantAdmin('tenant-rdel-upload');
      const folder = await admin.folders.create({ name: 'Inbox' });
      const bytes = fakePdf(340, 300);
      const init = await admin.documents.init({
        contentLength: bytes.byteLength,
        contentSha256: sha256Hex(bytes),
        folderId: folder.id,
      });
      await admin.documents.uploadProxy({ docId: init.document.id, body: bytes });

      await admin.folders.delete(folder.id, { recursive: true });

      const commit = await failureOf(
        admin.documents.commit({ docId: init.document.id, sha256: sha256Hex(bytes) }),
      );
      expect([404, 409]).toContain(commit?.status);
      const loose = (await admin.documents.create({ bytes: fakePdf(341, 300) })).document;
      expect(
        (await failureOf(admin.folders.moveInto(folder.id, { documentIds: [loose.id] })))?.status,
      ).toBe(404);
    });
  });

  describe(`Finishing deletes left behind [${dialect.label}]`, () => {
    let fx: Fixture;

    beforeAll(async () => {
      fx = await buildFixture({ sweepIntervalMs: 50, deletingGraceMs: 0 });
    });
    afterAll(async () => {
      await tearDown(fx);
    });

    test('a document left deleting is finished by the sweeper', async () => {
      const tenant = 'tenant-sweep-deleting';
      const admin = createCloudAdmin({
        baseUrl: fx.baseUrl,
        tenantToken: adminToken(tenant),
      }).tenant(tenant);
      const doc = (await admin.documents.create({ bytes: fakePdf(350, 300) })).document;
      const key = StorageKeys.basePdf(tenant, doc.id);
      expect(await fx.store.stat(key)).not.toBeNull();

      // The first phase alone, as a crash between the two would leave it.
      await new DocumentsRepo(fx.db).beginDelete(doc.id, tenant);

      await eventually(async () => (await failureOf(admin.documents.get(doc.id)))?.status === 404);
      expect(await fx.store.stat(key)).toBeNull();
    });
  });
}
