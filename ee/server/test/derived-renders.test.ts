import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  buildApp,
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'derived-renders-secret';

/** Canonical lattice tokens (SCALE-OUT §2.1): alphabetical, codec-exact. */
const THUMB_TOKEN =
  'background=white,contentVersion=1,format=webp,includeAnnotations=false,viewport.kind=width,viewport.width=320';
const W640_TOKEN =
  'background=white,contentVersion=1,format=webp,includeAnnotations=false,viewport.kind=width,viewport.width=640';
/** Off-lattice: a width outside the ladder (the old viewer default). */
const OFFLATTICE_TOKEN =
  'annotationVersion=1,background=white,contentVersion=1,format=webp,includeAnnotations=true,viewport.kind=width,viewport.width=720';
/** Rect-target region render: the (future) tile policy's jurisdiction —
 *  exempt from full-page enforcement, compute-only until WS2c. */
const RECT_TOKEN =
  'background=white,contentVersion=1,format=webp,includeAnnotations=false,target.kind=rect,target.rect.bottom=0,target.rect.left=0,target.rect.right=100,target.rect.top=100,viewport.kind=width,viewport.width=64';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
  storage: FsObjectStore;
}

describe('WS2 derived renders', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await buildFixture();
  });

  afterEach(async () => {
    await tearDown(fx);
  });

  test('lattice render is durable: read-through persists, second read skips the worker', async () => {
    const tenantId = 'tenant-derived';
    const docId = 'docderived0001';
    const baseSha = await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const renders = spyPagesRenderCount(fx);
    const url = `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${THUMB_TOKEN}`;
    const headers = { Authorization: `Bearer ${docToken(tenantId, docId)}` };

    const first = await fetch(url, { headers });
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/webp');
    expect(first.headers.get('cache-control')).toContain('immutable');
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    expect(firstBytes.byteLength).toBeGreaterThan(0);

    // The artifact exists at the canonical base-tier key.
    const key = StorageKeys.derivedRenderBase(tenantId, baseSha, 1, THUMB_TOKEN);
    expect(await fx.storage.exists(key)).toBe(true);

    // Second read: identical bytes, zero additional worker renders.
    const second = await fetch(url, { headers });
    expect(second.status).toBe(200);
    const secondBytes = new Uint8Array(await second.arrayBuffer());
    expect(Buffer.from(secondBytes).equals(Buffer.from(firstBytes))).toBe(true);
    expect(renders.count()).toBe(1);
  });

  test('singleflight: concurrent cold reads produce exactly one render', async () => {
    const tenantId = 'tenant-flight';
    const docId = 'docflight00001';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    const renders = spyPagesRenderCount(fx);
    const url = `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${THUMB_TOKEN}`;
    const headers = { Authorization: `Bearer ${docToken(tenantId, docId)}` };

    const responses = await Promise.all(Array.from({ length: 10 }, () => fetch(url, { headers })));
    for (const res of responses) expect(res.status).toBe(200);
    expect(renders.count()).toBe(1);
  });

  test('off-lattice tokens: computed but never persisted; enforcement rejects with the policy', async () => {
    const tenantId = 'tenant-lattice';
    const docId = 'doclattice0001';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    const headers = { Authorization: `Bearer ${docToken(tenantId, docId)}` };

    // Default fixture: enforce=false → width-kind renders still work…
    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${OFFLATTICE_TOKEN}`,
      {
        headers,
      },
    );
    expect(res.status).toBe(200);
    // …but leave nothing durable behind (only the on-lattice tier persists).
    const derivedPrefix = `${tenantId}/derived/`;
    const { deleted } = await fx.storage.deletePrefix(derivedPrefix);
    expect(deleted).toBe(0);

    // Enforcing fixture: the same token is refused, policy attached.
    const strict = await buildFixture({ renderLattice: { enforce: true } });
    try {
      const strictDoc = 'docstrict00001';
      await seedDocument(strict, tenantId, strictDoc, { pageCount: 1 });
      const strictHeaders = { Authorization: `Bearer ${docToken(tenantId, strictDoc)}` };
      const rejected = await fetch(
        `${strict.baseUrl}/v1/docs/${strictDoc}/render/pages/1/data@${OFFLATTICE_TOKEN}`,
        { headers: strictHeaders },
      );
      expect(rejected.status).toBe(400);
      const body = (await rejected.json()) as {
        error: { details?: { renderPolicy?: { fullPage: { widths: number[] } } } };
      };
      expect(body.error.details?.renderPolicy?.fullPage.widths).toEqual([320, 640, 1280, 2560]);

      // Rect-target region renders are EXEMPT from full-page enforcement:
      // they belong to the (future) tile policy, and rejecting them here
      // would kill tiling before it exists.
      const rectRender = await fetch(
        `${strict.baseUrl}/v1/docs/${strictDoc}/render/pages/1/data@${RECT_TOKEN}`,
        { headers: strictHeaders },
      );
      expect(rectRender.status).toBe(200);

      const accepted = await fetch(
        `${strict.baseUrl}/v1/docs/${strictDoc}/render/pages/1/data@${W640_TOKEN}`,
        { headers: strictHeaders },
      );
      expect(accepted.status).toBe(200);
    } finally {
      await tearDown(strict);
    }
  });

  test('/v1/access advertises the render policy', async () => {
    const tenantId = 'tenant-policy';
    const docId = 'docpolicy00001';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    const res = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ docId, layerName: 'default' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      renderPolicy?: {
        fullPage: { widths: number[] };
        maxRenderPixels: number;
        formats: string[];
        enforced: boolean;
      };
    };
    expect(body.renderPolicy).toEqual({
      fullPage: { widths: [320, 640, 1280, 2560] },
      maxRenderPixels: 32_000_000,
      formats: ['webp'],
      background: 'white',
      enforced: false,
    });
  });

  test('warm on upload: commit renders page 1, records key + ready, admin routes serve it', async () => {
    const tenantId = 'tenant-warm';
    const adminHeaders = {
      Authorization: `Bearer ${adminToken(tenantId)}`,
      'Content-Type': 'application/json',
    };
    const bytes = stubPdfBytes({ pageCount: 3 });
    const docId = await adminUpload(fx, adminHeaders, bytes);

    // Warm is fire-and-forget from commit — poll the list until ready.
    await vi.waitFor(async () => {
      const doc = await adminGetDoc(fx, adminHeaders, docId);
      expect(doc.thumbnailState).toBe('ready');
    });

    const doc = await adminGetDoc(fx, adminHeaders, docId);
    expect(doc.thumbnailUrl).toBe(`/v1/admin/documents/${docId}/thumbnail`);

    const tile = await fetch(`${fx.baseUrl}${doc.thumbnailUrl}`, {
      headers: { Authorization: `Bearer ${adminToken(tenantId)}` },
    });
    expect(tile.status).toBe(200);
    expect(tile.headers.get('content-type')).toBe('image/webp');
    expect((await tile.arrayBuffer()).byteLength).toBeGreaterThan(0);

    // The warmed artifact is the SAME canonical object the doc-plane
    // read-through would produce — one door (SCALE-OUT §2.1c).
    const baseSha = createHash('sha256').update(bytes).digest('hex');
    expect(
      await fx.storage.exists(StorageKeys.derivedRenderBase(tenantId, baseSha, 1, THUMB_TOKEN)),
    ).toBe(true);
  });

  test('user-password documents get NO derived artifact — locked, by design', async () => {
    const tenantId = 'tenant-locked';
    const adminHeaders = {
      Authorization: `Bearer ${adminToken(tenantId)}`,
      'Content-Type': 'application/json',
    };
    const bytes = stubPdfBytes({ pageCount: 2, requiresPassword: true });
    const docId = await adminUpload(fx, adminHeaders, bytes);

    await vi.waitFor(async () => {
      const doc = await adminGetDoc(fx, adminHeaders, docId);
      expect(doc.thumbnailState).toBe('locked');
    });

    // The security assertion: zero derived objects for this tenant.
    const { deleted } = await fx.storage.deletePrefix(`${tenantId}/derived/`);
    expect(deleted).toBe(0);

    const tile = await fetch(`${fx.baseUrl}/v1/admin/documents/${docId}/thumbnail`, {
      headers: { Authorization: `Bearer ${adminToken(tenantId)}` },
    });
    expect(tile.status).toBe(404);
    const body = (await tile.json()) as { error: { state: string } };
    expect(body.error.state).toBe('locked');
  });

  test('dedup: same bytes twice → warm is an instant hit on the shared base tier', async () => {
    const tenantId = 'tenant-dedup';
    const adminHeaders = {
      Authorization: `Bearer ${adminToken(tenantId)}`,
      'Content-Type': 'application/json',
    };
    const bytes = stubPdfBytes({ pageCount: 2 });
    const docA = await adminUpload(fx, adminHeaders, bytes);
    await vi.waitFor(async () => {
      expect((await adminGetDoc(fx, adminHeaders, docA)).thumbnailState).toBe('ready');
    });

    const docB = await adminUpload(fx, adminHeaders, bytes, { idempotencyKey: 'second-copy' });
    await vi.waitFor(async () => {
      expect((await adminGetDoc(fx, adminHeaders, docB)).thumbnailState).toBe('ready');
    });

    // One base-tier artifact serves both documents (sha-addressed tier).
    const baseSha = createHash('sha256').update(bytes).digest('hex');
    const a = await adminGetDoc(fx, adminHeaders, docA);
    const b = await adminGetDoc(fx, adminHeaders, docB);
    expect(a.thumbnailUrl).not.toBeNull();
    expect(b.thumbnailUrl).not.toBeNull();
    expect(
      await fx.storage.exists(StorageKeys.derivedRenderBase(tenantId, baseSha, 1, THUMB_TOKEN)),
    ).toBe(true);
  });

  test('layer tier: annotation-pinned layer render persists under the doc prefix', async () => {
    const tenantId = 'tenant-layer-tier';
    const docId = 'doclayertier01';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    const headers = { Authorization: `Bearer ${docToken(tenantId, docId, 'alice')}` };

    // Layer view at the base epoch: annotations-on renders pin BOTH counters.
    const token =
      'annotationVersion=1,background=white,contentVersion=1,format=webp,includeAnnotations=true,viewport.kind=width,viewport.width=320';
    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/alice/render/pages/1/data@${token}`,
      { headers },
    );
    expect(res.status).toBe(200);
    expect(
      await fx.storage.exists(StorageKeys.derivedRenderLayer(tenantId, docId, 'alice', 1, token)),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

async function buildFixture(opts?: {
  renderLattice?: { scales?: number[]; enforce?: boolean };
}): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'derived-renders-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'derived-renders-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildApp({
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 64 * 1024 * 1024,
    ...(opts?.renderLattice ? { renderLattice: opts.renderLattice } : {}),
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return {
    bundle,
    app: bundle.app,
    db,
    baseUrl,
    storageRoot,
    cacheRoot,
    storage: new FsObjectStore({ root: storageRoot }),
  };
}

async function tearDown(fx: Fixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

function docToken(tenantId: string, docId: string, layerName = 'default'): string {
  return signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
  });
}

function adminToken(tenantId: string): string {
  return signDevToken(SECRET, {
    sub: 'admin-1',
    tenant_id: tenantId,
    scope: ['*'],
  });
}

/** Stub-PDF bytes: byte0 = pageCount, byte1 = requires-password flag. */
function stubPdfBytes(opts: { pageCount: number; requiresPassword?: boolean }): Uint8Array {
  const bytes = new Uint8Array(4096);
  bytes[0] = opts.pageCount;
  bytes[1] = opts.requiresPassword ? 0x01 : 0x00;
  bytes.set(randomBytes(4094), 2);
  return bytes;
}

/** Direct-seed a ready document (no upload flow) for read-through tests. */
async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: { pageCount: number },
): Promise<string> {
  const bytes = stubPdfBytes({ pageCount: opts.pageCount });
  const sha = createHash('sha256').update(bytes).digest('hex');
  await fx.storage.put(StorageKeys.basePdf(tenantId, docId), bytes, {
    contentLength: bytes.byteLength,
  });
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
  return sha;
}

/** Count pages.render dispatches through the bundle's pool. */
function spyPagesRenderCount(fx: Fixture): { count: () => number } {
  const pool = fx.bundle.pool as unknown as {
    run: (
      docId: string,
      build: (id: number) => { payload: { kind: string } },
      s?: unknown,
    ) => Promise<unknown>;
  };
  let renders = 0;
  const original = pool.run.bind(pool);
  pool.run = async (docId, build, s) => {
    const wrapped = (id: number) => {
      const pack = build(id);
      if (pack.payload.kind === 'pages.render') renders += 1;
      return pack;
    };
    return original(docId, wrapped as never, s as never);
  };
  return { count: () => renders };
}

/** Drive the real admin upload flow: init → upload-direct → commit. */
async function adminUpload(
  fx: Fixture,
  headers: Record<string, string>,
  bytes: Uint8Array,
  opts?: { idempotencyKey?: string },
): Promise<string> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const init = await fetch(`${fx.baseUrl}/v1/admin/documents/init`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contentLength: bytes.byteLength,
      contentSha256: sha256,
      ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    }),
  });
  expect(init.status).toBe(200);
  const initBody = (await init.json()) as { tag: string; document: { id: string } };
  const docId = initBody.document.id;

  const upload = await fetch(`${fx.baseUrl}/v1/admin/documents/${docId}/upload-direct`, {
    method: 'POST',
    headers: {
      Authorization: headers.Authorization!,
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.byteLength),
    },
    body: Buffer.from(bytes),
  });
  expect(upload.status).toBe(200);

  const commit = await fetch(`${fx.baseUrl}/v1/admin/documents/${docId}/commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sha256 }),
  });
  expect(commit.status).toBe(200);
  return docId;
}

async function adminGetDoc(
  fx: Fixture,
  headers: Record<string, string>,
  docId: string,
): Promise<{ thumbnailState: string; thumbnailUrl: string | null }> {
  const res = await fetch(`${fx.baseUrl}/v1/admin/documents/${docId}`, {
    headers: { Authorization: headers.Authorization! },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    document: { thumbnailState: string; thumbnailUrl: string | null };
  };
  return body.document;
}
