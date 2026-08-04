import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
import { createValidTestLicenseGate } from '../src/licensing/testing';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'doc-versioned-secret';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const NO_STORE = 'private, no-store';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

async function buildFixture(): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'doc-versioned-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'doc-versioned-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildApp({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 2,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
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

function docToken(
  tenantId: string,
  docId: string,
  opts: { scope?: ReadonlyArray<string>; layerName?: string } = {},
): string {
  return signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: tenantId,
    doc_id: docId,
    scope: opts.scope ?? ['*'],
    ...(opts.layerName ? { layer_name: opts.layerName } : {}),
  });
}

function tenantAdminToken(tenantId: string): string {
  return signDevToken(SECRET, { sub: 'admin-1', tenant_id: tenantId, scope: ['*'] });
}

function tenantReadToken(tenantId: string): string {
  return signDevToken(SECRET, { sub: 'user-1', tenant_id: tenantId, scope: ['docs.read'] });
}

async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: { pageCount?: number } = {},
): Promise<void> {
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
}

describe('Phase 4 versioned reads — cache headers', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('/head sets private, no-store', async () => {
    const tenantId = 'tenant-cache-h';
    const docId = 'doccch001';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
  });

  test('/manifest@dN sets public, immutable', async () => {
    const tenantId = 'tenant-cache-m';
    const docId = 'doccch002';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CACHE);
  });

  test('/text@cN sets public, immutable', async () => {
    const tenantId = 'tenant-cache-t';
    const docId = 'doccch003';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CACHE);
  });

  test('/annotations@aN sets public, immutable', async () => {
    const tenantId = 'tenant-cache-a';
    const docId = 'doccch004';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/default/annotations/pages/1/items@annotationVersion=1`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CACHE);
  });
});

describe('Phase 4 versioned reads — GET /pages/:pon/text@cN', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('returns text + charCount for the current contentVersion (no liveness)', async () => {
    const tenantId = 'tenant-t';
    const docId = 'doctxx001';
    await seedDocument(fx, tenantId, docId, { pageCount: 4 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/2/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    // Content reads carry geometry/text only — no `pageState`. Liveness
    // (revision/weak state) rides on annotation reads + the manifest.
    const body = (await res.json()) as {
      text: string;
      charCount: number;
    };
    expect(body.text.length > 0).toBe(true);
    expect(body.charCount).toBe(body.text.length);
  });

  test('stale contentVersion returns 404', async () => {
    const tenantId = 'tenant-tstale';
    const docId = 'doctxx002';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=999`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
  });

  test('unknown pageObjectNumber returns 404', async () => {
    const tenantId = 'tenant-tunknown';
    const docId = 'doctxx003';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/999/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(404);
  });

  test('tenant admin token (Model B) reads doc text', async () => {
    const tenantId = 'tenant-tadmin';
    const docId = 'doctxx004';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${tenantAdminToken(tenantId)}` },
    });
    expect(res.status).toBe(200);
  });

  test('tenant token with docs.read scope (Model B) reads doc text', async () => {
    const tenantId = 'tenant-tdocsread';
    const docId = 'doctxx005';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${tenantReadToken(tenantId)}` },
    });
    expect(res.status).toBe(200);
  });

  test('cross-tenant doc token is rejected with 403', async () => {
    const tenantA = 'tenant-cross-a';
    const tenantB = 'tenant-cross-b';
    const docB = 'doctxx006';
    await seedDocument(fx, tenantB, docB);

    // Doc-scoped token whose tenant_id and doc_id match nothing real
    // in tenantB — server treats this as a foreign doc and 403s.
    const foreign = docToken(tenantA, docB);
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docB}/text/pages/1/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${foreign}` },
    });
    expect(res.status === 403 || res.status === 404).toBe(true);
  });

  test('doc-scoped token without text.copy capability is rejected with 403', async () => {
    const tenantId = 'tenant-tnoperm';
    const docId = 'doctxx007';
    await seedDocument(fx, tenantId, docId);

    // Token has doc.open + doc.render (so /head / /manifest work) but
    // explicitly lacks doc.text.copy, so /text rejects.
    const tok = docToken(tenantId, docId, { scope: ['doc.open', 'doc.render'] });
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(403);
  });

  test('missing Authorization header returns 401', async () => {
    const tenantId = 'tenant-tunauth';
    const docId = 'doctxx008';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`);
    expect(res.status).toBe(401);
  });
});

describe('Phase 4 versioned reads — GET /pages/:pon/annotations@aN', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('returns annotation list for the current annotationVersion', async () => {
    const tenantId = 'tenant-a-ok';
    const docId = 'docann001';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/default/annotations/pages/1/items@annotationVersion=1`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pageState: { pageObjectNumber: number };
      annotations: unknown[];
    };
    expect(body.pageState.pageObjectNumber).toBe(1);
    expect(Array.isArray(body.annotations)).toBe(true);
  });

  test('stale annotationVersion returns 404', async () => {
    const tenantId = 'tenant-a-stale';
    const docId = 'docann002';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/default/annotations/pages/1/items@annotationVersion=999`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
      },
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
  });

  test('unknown pageObjectNumber returns 404', async () => {
    const tenantId = 'tenant-a-pon';
    const docId = 'docann003';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/default/annotations/pages/999/items@annotationVersion=1`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('Phase 4 manifest pages — per-page versions', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await buildFixture();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('every manifest page reports state and cache pins separately', async () => {
    const tenantId = 'tenant-m-pp';
    const docId = 'docmpp001';
    await seedDocument(fx, tenantId, docId, { pageCount: 5 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      docVersion: number;
      pages: Array<{
        state: {
          pageObjectNumber: number;
          revision: { docSessionId: string; generation: number };
          weakAnnotationState: { kind: string; hasAnyWeakAnnotations: boolean };
        };
        cache: {
          contentVersion: number;
          annotationVersion: number;
        };
      }>;
    };
    expect(body.docVersion).toBe(1);
    expect(body.pages).toHaveLength(5);
    for (let i = 0; i < body.pages.length; i++) {
      const page = body.pages[i]!;
      expect(page.state.revision).toEqual({
        docSessionId: `cloud:base:${docId}`,
        pageObjectNumber: page.state.pageObjectNumber,
        generation: 0,
      });
      expect(page.state.weakAnnotationState).toEqual({
        kind: 'known',
        hasAnyWeakAnnotations: false,
      });
      expect(page.cache.contentVersion).toBe(1);
      expect(page.cache.annotationVersion).toBe(1);
    }

    const documentPageCount = await fx.db
      .selectFrom('document_pages')
      .select(fx.db.fn.countAll().as('n'))
      .where('doc_id', '=', docId)
      .executeTakeFirst();
    const layerCount = await fx.db
      .selectFrom('layers')
      .select(fx.db.fn.countAll().as('n'))
      .where('doc_id', '=', docId)
      .executeTakeFirst();
    const layerPageCount = await fx.db
      .selectFrom('layer_pages')
      .select(fx.db.fn.countAll().as('n'))
      .executeTakeFirst();
    expect(Number(documentPageCount?.n ?? 0)).toBe(5);
    expect(Number(layerCount?.n ?? 0)).toBe(0);
    expect(Number(layerPageCount?.n ?? 0)).toBe(0);
  });

  test('manifest is served from durable page rows after first initialization', async () => {
    const tenantId = 'tenant-m-db';
    const docId = 'docmdb001';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });
    const token = docToken(tenantId, docId);

    const first = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(first.status).toBe(200);

    await fx.db
      .updateTable('document_pages')
      .set({
        annotation_version: 7,
        annotation_generation: 3,
        has_weak_annotations: 1,
      })
      .where('doc_id', '=', docId)
      .where('page_object_number', '=', 1)
      .execute();

    const second = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as {
      pages: Array<{
        state: {
          pageObjectNumber: number;
          revision: { docSessionId: string; generation: number };
          weakAnnotationState: { kind: string; hasAnyWeakAnnotations: boolean };
        };
        cache: { annotationVersion: number };
      }>;
    };
    const page = body.pages.find((p) => p.state.pageObjectNumber === 1);
    expect(page).toMatchObject({
      cache: { annotationVersion: 7 },
      state: {
        revision: { docSessionId: `cloud:base:${docId}`, generation: 3 },
        weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: true },
      },
    });
  });

  test('layer manifest is served from durable layer page rows', async () => {
    const tenantId = 'tenant-layer-db';
    const docId = 'doclayerdb';
    const layerId = 'layer-alice-1';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const base = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(base.status).toBe(200);

    const now = Date.now();
    await fx.db
      .insertInto('layers')
      .values({
        id: layerId,
        doc_id: docId,
        tenant_id: tenantId,
        name: layerName,
        doc_version: 4,
        current_version: 3,
        current_artifact_key: 'tenant/docs/doclayerdb/layers/alice/v0003.delta',
        current_artifact_sha: 'delta-sha',
        current_artifact_size: 123,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await fx.db
      .insertInto('layer_pages')
      .values([
        {
          layer_id: layerId,
          page_object_number: 1,
          content_version: 2,
          annotation_version: 5,
          annotation_generation: 9,
          has_weak_annotations: 1,
          updated_at: now,
        },
        {
          layer_id: layerId,
          page_object_number: 2,
          content_version: 1,
          annotation_version: 1,
          annotation_generation: 0,
          has_weak_annotations: 0,
          updated_at: now,
        },
      ])
      .execute();

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest@docVersion=4`,
      {
        headers: { Authorization: `Bearer ${docToken(tenantId, docId, { layerName })}` },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CACHE);
    const body = (await res.json()) as {
      docVersion: number;
      pages: Array<{
        state: {
          pageObjectNumber: number;
          revision: { docSessionId: string; generation: number };
          weakAnnotationState: { kind: string; hasAnyWeakAnnotations: boolean };
        };
        cache: { contentVersion: number; annotationVersion: number };
      }>;
    };
    expect(body.docVersion).toBe(4);
    expect(body.pages[0]).toMatchObject({
      state: {
        pageObjectNumber: 1,
        revision: { docSessionId: `cloud:layer:${docId}:${layerName}`, generation: 9 },
        weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: true },
      },
      cache: { contentVersion: 2, annotationVersion: 5 },
    });
  });

  test('never-created layer manifest falls through to base without creating layer rows', async () => {
    const tenantId = 'tenant-layer-empty';
    const docId = 'doclayerempty';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/bob/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId, { layerName: 'bob' })}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pages: Array<{ state: { revision: { docSessionId: string } } }>;
    };
    expect(body.pages[0]?.state.revision.docSessionId).toBe(`cloud:layer:${docId}:bob`);

    const layerCount = await fx.db
      .selectFrom('layers')
      .select(fx.db.fn.countAll().as('n'))
      .where('doc_id', '=', docId)
      .executeTakeFirst();
    expect(Number(layerCount?.n ?? 0)).toBe(0);
  });

  test('layer leaf reads use durable layer versions and reject stale versions', async () => {
    const tenantId = 'tenant-layer-leaf';
    const docId = 'doclayerleaf';
    const layerId = 'layer-leaf-alice';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });
    const token = docToken(tenantId, docId, { layerName });

    const base = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(base.status).toBe(200);

    const now = Date.now();
    await fx.db
      .insertInto('layers')
      .values({
        id: layerId,
        doc_id: docId,
        tenant_id: tenantId,
        name: layerName,
        doc_version: 2,
        current_version: 0,
        current_artifact_key: null,
        current_artifact_sha: null,
        current_artifact_size: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await fx.db
      .insertInto('layer_pages')
      .values([
        {
          layer_id: layerId,
          page_object_number: 1,
          content_version: 4,
          annotation_version: 6,
          annotation_generation: 8,
          has_weak_annotations: 1,
          updated_at: now,
        },
        {
          layer_id: layerId,
          page_object_number: 2,
          content_version: 1,
          annotation_version: 1,
          annotation_generation: 0,
          has_weak_annotations: 0,
          updated_at: now,
        },
      ])
      .execute();

    const text = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/text/pages/1/data@contentVersion=4`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    // The text leaf resolves at the durable contentVersion (4) and is
    // immutably cacheable. It carries no liveness — `pageState` lives on
    // annotation reads + the manifest, not on content reads.
    expect(text.status).toBe(200);
    expect(text.headers.get('cache-control')).toBe(IMMUTABLE_CACHE);
    const textBody = (await text.json()) as { text: string };
    expect(typeof textBody.text).toBe('string');

    const annotations = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items@annotationVersion=6`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(annotations.status).toBe(200);
    expect(annotations.headers.get('cache-control')).toBe(IMMUTABLE_CACHE);

    const stale = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items@annotationVersion=5`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(stale.status).toBe(404);
    expect(stale.headers.get('cache-control')).toBe(NO_STORE);
  });

  test('layer leaf reads open the persisted layer artifact when one exists', async () => {
    const tenantId = 'tenant-layer-artifact';
    const docId = 'doclayerartifact';
    const layerId = 'layer-artifact-alice';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });
    const token = docToken(tenantId, docId, { layerName });

    const base = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(base.status).toBe(200);

    const artifact = new Uint8Array([42, 7, 3, 1]);
    const artifactKey = StorageKeys.layerArtifact(tenantId, docId, layerName, 1);
    const storage = new FsObjectStore({ root: fx.storageRoot });
    await storage.put(artifactKey, artifact, { contentLength: artifact.byteLength });
    const artifactSha = createHash('sha256').update(artifact).digest('hex');

    const now = Date.now();
    await fx.db
      .insertInto('layers')
      .values({
        id: layerId,
        doc_id: docId,
        tenant_id: tenantId,
        name: layerName,
        doc_version: 2,
        current_version: 1,
        current_artifact_key: artifactKey,
        current_artifact_sha: artifactSha,
        current_artifact_size: artifact.byteLength,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await fx.db
      .insertInto('layer_pages')
      .values([
        {
          layer_id: layerId,
          page_object_number: 1,
          content_version: 3,
          annotation_version: 1,
          annotation_generation: 0,
          has_weak_annotations: 0,
          updated_at: now,
        },
        {
          layer_id: layerId,
          page_object_number: 2,
          content_version: 1,
          annotation_version: 1,
          annotation_generation: 0,
          has_weak_annotations: 0,
          updated_at: now,
        },
      ])
      .execute();

    const text = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/text/pages/1/data@contentVersion=3`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(text.status).toBe(200);
    const textBody = (await text.json()) as { text: string };
    expect(textBody.text).toContain('artifact:42');
  });

  test('layer open fails closed when the current artifact is missing', async () => {
    const tenantId = 'tenant-layer-missing-artifact';
    const docId = 'doclayermissing';
    const layerId = 'layer-missing-alice';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    const token = docToken(tenantId, docId, { layerName });

    const base = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(base.status).toBe(200);

    const now = Date.now();
    await fx.db
      .insertInto('layers')
      .values({
        id: layerId,
        doc_id: docId,
        tenant_id: tenantId,
        name: layerName,
        doc_version: 2,
        current_version: 1,
        current_artifact_key: StorageKeys.layerArtifact(tenantId, docId, layerName, 1),
        current_artifact_sha: null,
        current_artifact_size: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await fx.db
      .insertInto('layer_pages')
      .values({
        layer_id: layerId,
        page_object_number: 1,
        content_version: 2,
        annotation_version: 1,
        annotation_generation: 0,
        has_weak_annotations: 0,
        updated_at: now,
      })
      .execute();

    const res = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/text/pages/1/data@contentVersion=2`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(res.status).toBe(422);
    expect(res.headers.get('cache-control')).toBeNull();
  });

  test('doc-scoped layer token cannot read another layer namespace', async () => {
    const tenantId = 'tenant-layer-guard';
    const docId = 'doclayerguard';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/bob/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId, { layerName: 'alice' })}` },
    });
    expect(res.status).toBe(403);
  });

  test('unversioned read aliases return current state with no-store', async () => {
    const tenantId = 'tenant-alias';
    const docId = 'docalias1';
    await seedDocument(fx, tenantId, docId, { pageCount: 2 });
    const token = docToken(tenantId, docId);

    const manifest = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('cache-control')).toBe(NO_STORE);

    const text = await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(text.status).toBe(200);
    expect(text.headers.get('cache-control')).toBe(NO_STORE);

    const annotations = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/default/annotations/pages/1/items`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(annotations.status).toBe(200);
    expect(annotations.headers.get('cache-control')).toBe(NO_STORE);
  });

  test('layer unversioned read aliases return current layer state with no-store', async () => {
    const tenantId = 'tenant-layer-alias';
    const docId = 'doclayeralias1';
    const layerId = 'layer-alias-alice';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    const token = docToken(tenantId, docId, { layerName });

    const base = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(base.status).toBe(200);

    const now = Date.now();
    await fx.db
      .insertInto('layers')
      .values({
        id: layerId,
        doc_id: docId,
        tenant_id: tenantId,
        name: layerName,
        doc_version: 5,
        current_version: 0,
        current_artifact_key: null,
        current_artifact_sha: null,
        current_artifact_size: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await fx.db
      .insertInto('layer_pages')
      .values({
        layer_id: layerId,
        page_object_number: 1,
        content_version: 7,
        annotation_version: 9,
        annotation_generation: 4,
        has_weak_annotations: 1,
        updated_at: now,
      })
      .execute();

    const manifest = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('cache-control')).toBe(NO_STORE);
    const manifestBody = (await manifest.json()) as {
      docVersion: number;
      pages: Array<{
        state: { revision: { generation: number } };
        cache: { contentVersion: number; annotationVersion: number };
      }>;
    };
    expect(manifestBody.docVersion).toBe(5);
    expect(manifestBody.pages[0]).toMatchObject({
      state: { revision: { generation: 4 } },
      cache: { contentVersion: 7, annotationVersion: 9 },
    });

    const text = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/text/pages/1/data`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(text.status).toBe(200);
    expect(text.headers.get('cache-control')).toBe(NO_STORE);

    const annotations = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(annotations.status).toBe(200);
    expect(annotations.headers.get('cache-control')).toBe(NO_STORE);
    const annotationsBody = (await annotations.json()) as {
      pageState: { revision: { docSessionId: string; generation: number } };
    };
    expect(annotationsBody.pageState.revision).toMatchObject({
      docSessionId: `cloud:layer:${docId}:${layerName}`,
      generation: 4,
    });
  });

  test('DB-backed cloud mode does not register legacy in-memory mutation routes', async () => {
    const tenantId = 'tenant-no-legacy';
    const docId = 'docnolegacy';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    const res = await fetch(`${fx.baseUrl}/v1/documents/${docId}/pages/1/annotations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(tenantId, docId, { layerName: 'alice' })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  test('future manifest versions fail closed with no-store', async () => {
    const tenantId = 'tenant-future';
    const docId = 'docfuture';
    await seedDocument(fx, tenantId, docId);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest@docVersion=999`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId)}` },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(NO_STORE);
  });
});
