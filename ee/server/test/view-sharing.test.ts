import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  buildApp,
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StaticKmsKeyring,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import type { CdnSigner, SignInput } from '../src/cdn/CdnSigner';

/**
 * WS2b — plane-scoped view sharing. The law under test: a layer is a set of
 * per-plane DELTAS over the immutable base; every read resolves at the
 * doc-level (shared) URL iff EVERY plane it depends on is inherited, executes
 * on the BASE worker session while it does, and each mutation kind flips
 * exactly the planes it owns. The manifest advertises `scopes`; the origin
 * guards are the truth; the `/v1/access` grant is the TTL-bounded edge
 * optimization.
 */

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'view-sharing-secret';

/** Canonical lattice token: durable read-through → countable single render. */
const W320_TOKEN =
  'background=white,contentVersion=1,format=webp,viewport.kind=width,viewport.width=320';
/** The annotated twin — its own path family (`/render/annotated/…`). */
const W320_ANNOTATED_TOKEN =
  'annotationVersion=1,background=white,contentVersion=1,format=webp,viewport.kind=width,viewport.width=320';

const ALL_BASE = {
  content: 'base',
  annotations: 'base',
  layout: 'base',
  attachments: 'base',
  metadata: 'base',
  actions: 'base',
};

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
  coverageLog: Array<{ layerName?: string; resourceIds: string[] }>;
}

describe('WS2b plane-scoped view sharing', () => {
  // One app per describe (tests seed distinct docs and run sequentially):
  // ten per-test boots made the beforeEach hook flaky under full-suite load.
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  });

  afterAll(async () => {
    await tearDown(fx);
  });

  test('the real SDK open sequence on pristine layers: zero layer sessions, one shared URL set', async () => {
    const tenantId = 'tenant-share';
    const docId = 'docshare00001';
    await seedDocument(fx, tenantId, docId);
    const spy = spyWorkerBuilds(fx);

    // Two visitors, two layers — the recommended layer-per-visitor shape —
    // walking the endpoints a real viewer open touches: head → manifest →
    // layout → annotation list → renders → text → actions → metadata.
    for (const layer of ['alice', 'bob']) {
      const head = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layer}/head`, {
        headers: auth(docToken(tenantId, docId, layer)),
      });
      expect(head.status).toBe(200);
      const manifest = await fetchLayerManifest(fx, tenantId, docId, layer);
      expect(manifest.scopes).toEqual(ALL_BASE);
      for (const page of manifest.pages) expect(page.cache.contentVersion).toBe(1);
    }

    const sharedReads = [
      `/v1/docs/${docId}/layout@layoutVersion=1`,
      `/v1/docs/${docId}/annotations/pages/1/items@annotationVersion=1`,
      `/v1/docs/${docId}/render/pages/1/data@${W320_TOKEN}`,
      `/v1/docs/${docId}/text/pages/1/data@contentVersion=1`,
      `/v1/docs/${docId}/actions@actionsVersion=1`,
      `/v1/docs/${docId}/metadata@metadataVersion=1`,
    ];
    for (const path of sharedReads) {
      const a = await fetch(`${fx.baseUrl}${path}`, {
        headers: auth(docToken(tenantId, docId, 'alice')),
      });
      const b = await fetch(`${fx.baseUrl}${path}`, {
        headers: auth(docToken(tenantId, docId, 'bob')),
      });
      expect(a.status, path).toBe(200);
      expect(b.status, path).toBe(200);
      const bytesA = Buffer.from(await a.arrayBuffer());
      const bytesB = Buffer.from(await b.arrayBuffer());
      // Identical views → identical bytes at ONE URL: the CDN cache line.
      expect(bytesA.equals(bytesB), path).toBe(true);
    }

    // The annotated render family shares too — a base's own annotations are
    // visible through every pristine layer (content + annotations planes).
    const annotated = `${fx.baseUrl}/v1/docs/${docId}/render/annotated/pages/1/data@${W320_ANNOTATED_TOKEN}`;
    expect(
      (await fetch(annotated, { headers: auth(docToken(tenantId, docId, 'alice')) })).status,
    ).toBe(200);
    expect(
      (await fetch(annotated, { headers: auth(docToken(tenantId, docId, 'bob')) })).status,
    ).toBe(200);

    // THE economics this workstream exists for: 1,000 pristine visitors are
    // this test's two — ZERO layer worker sessions were ever created, and
    // the durable read-through collapsed the annotation-free render into a
    // single worker render.
    expect(spy.count('open.layerFileBase')).toBe(0);
    expect(spy.count('pages.render')).toBeLessThanOrEqual(2);
  });

  test('annotation writes own the annotations plane only', async () => {
    const tenantId = 'tenant-anno';
    const docId = 'docanno000001';
    await seedDocument(fx, tenantId, docId);

    const created = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/alice/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: {
          ...auth(docToken(tenantId, docId, 'alice')),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(highlightDraft()),
      },
    );
    expect(created.status).toBe(200);

    const manifest = await fetchLayerManifest(fx, tenantId, docId, 'alice');
    expect(manifest.scopes).toEqual({ ...ALL_BASE, annotations: 'layer' });
    const page1 = manifest.pages.find((p) => p.state.pageObjectNumber === 1)!;
    expect(page1.cache.annotationVersion).toBeGreaterThan(1);
    expect(page1.cache.contentVersion).toBe(1);

    const aliceAuth = auth(docToken(tenantId, docId, 'alice'));
    const bobAuth = auth(docToken(tenantId, docId, 'bob'));

    // Content-plane reads keep sharing through the annotated layer's token —
    // the most common divergence must not cost raster/text sharing.
    const render = `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${W320_TOKEN}`;
    expect((await fetch(render, { headers: aliceAuth })).status).toBe(200);
    expect(
      (
        await fetch(`${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`, {
          headers: aliceAuth,
        })
      ).status,
    ).toBe(200);

    // Annotation-plane reads flip: shared paths refuse (404 → the SDK's
    // manifest-refresh rail), the layer path serves, and Bob's pristine
    // layer keeps sharing.
    const sharedItems = `${fx.baseUrl}/v1/docs/${docId}/annotations/pages/1/items@annotationVersion=1`;
    expect((await fetch(sharedItems, { headers: aliceAuth })).status).toBe(404);
    expect((await fetch(sharedItems, { headers: bobAuth })).status).toBe(200);
    expect(
      (
        await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/annotations/pages/1/items`, {
          headers: aliceAuth,
        })
      ).status,
    ).toBe(200);

    // The annotated render family depends on content+annotations → refused
    // for alice, still shared for bob.
    const annotated = `${fx.baseUrl}/v1/docs/${docId}/render/annotated/pages/1/data@${W320_ANNOTATED_TOKEN}`;
    expect((await fetch(annotated, { headers: aliceAuth })).status).toBe(404);
    expect((await fetch(annotated, { headers: bobAuth })).status).toBe(200);
  });

  test('move/rotate own the LAYOUT plane only: normalized artifacts keep sharing', async () => {
    const tenantId = 'tenant-rotate';
    const docId = 'docrotate0001';
    await seedDocument(fx, tenantId, docId);

    const rotated = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/pages/rotate`, {
      method: 'POST',
      headers: { ...auth(docToken(tenantId, docId, 'alice')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageObjectNumbers: [1], rotation: 90 }),
    });
    expect(rotated.status).toBe(200);

    // Rotation is presentation metadata over NORMALIZED artifacts (the
    // SDK's own absorbPageStructure law): only the layout plane flips.
    const alice = await fetchLayerManifest(fx, tenantId, docId, 'alice');
    expect(alice.scopes).toEqual({ ...ALL_BASE, layout: 'layer' });

    const aliceAuth = auth(docToken(tenantId, docId, 'alice'));
    const render = `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${W320_TOKEN}`;
    expect((await fetch(render, { headers: aliceAuth })).status).toBe(200);
    expect(
      (
        await fetch(
          `${fx.baseUrl}/v1/docs/${docId}/annotations/pages/1/items@annotationVersion=1`,
          {
            headers: aliceAuth,
          },
        )
      ).status,
    ).toBe(200);

    // The layout leaf itself is owned: shared path refused, layer path serves.
    expect(
      (
        await fetch(`${fx.baseUrl}/v1/docs/${docId}/layout@layoutVersion=1`, {
          headers: aliceAuth,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/layout@layoutVersion=2`, {
          headers: aliceAuth,
        })
      ).status,
    ).toBe(200);
    // Bob's pristine layer still shares the layout leaf.
    expect(
      (
        await fetch(`${fx.baseUrl}/v1/docs/${docId}/layout@layoutVersion=1`, {
          headers: auth(docToken(tenantId, docId, 'bob')),
        })
      ).status,
    ).toBe(200);
  });

  test('page delete removes content from the view: content+annotations+layout flip', async () => {
    const tenantId = 'tenant-delete';
    const docId = 'docdelete0001';
    await seedDocument(fx, tenantId, docId);

    const deleted = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/pages/delete`, {
      method: 'POST',
      headers: { ...auth(docToken(tenantId, docId, 'alice')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageObjectNumbers: [2] }),
    });
    expect(deleted.status, await deleted.clone().text()).toBe(200);

    const alice = await fetchLayerManifest(fx, tenantId, docId, 'alice');
    expect(alice.scopes).toEqual({
      ...ALL_BASE,
      content: 'layer',
      annotations: 'layer',
      layout: 'layer',
    });

    // §2.5's rule at the origin: never base artifacts for a view that
    // removed content — even for pages the view still contains.
    const aliceAuth = auth(docToken(tenantId, docId, 'alice'));
    const bobAuth = auth(docToken(tenantId, docId, 'bob'));
    const render = `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${W320_TOKEN}`;
    const text = `${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`;
    const items = `${fx.baseUrl}/v1/docs/${docId}/annotations/pages/1/items@annotationVersion=1`;
    for (const url of [render, text, items]) {
      expect((await fetch(url, { headers: aliceAuth })).status, url).toBe(404);
      expect((await fetch(url, { headers: bobAuth })).status, url).toBe(200);
    }
    // …but the attachments and metadata planes were never touched.
    expect(
      (
        await fetch(`${fx.baseUrl}/v1/docs/${docId}/attachments@attachmentsVersion=1`, {
          headers: aliceAuth,
        })
      ).status,
    ).toBe(200);
    // Tenant/admin tokens are not layer-pinned — base stays theirs.
    expect((await fetch(render, { headers: auth(adminToken(tenantId)) })).status).toBe(200);
  });

  test('the base manifest carries no scopes block (meaningless there)', async () => {
    const tenantId = 'tenant-basem';
    const docId = 'docbasem00001';
    await seedDocument(fx, tenantId, docId);
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: auth(docToken(tenantId, docId, 'default')),
    });
    expect(res.status).toBe(200);
    const manifest = (await res.json()) as Record<string, unknown>;
    expect('scopes' in manifest).toBe(false);
  });

  test('the edge grant mirrors the scopes per plane', async () => {
    const tenantId = 'tenant-edge';
    const docId = 'docedge000001';
    await seedDocument(fx, tenantId, docId);

    const accessFor = async (layer: string) => {
      const res = await fetch(`${fx.baseUrl}/v1/access`, {
        method: 'POST',
        headers: { ...auth(docToken(tenantId, docId, layer)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, layerName: layer }),
      });
      expect(res.status).toBe(200);
      return fx.coverageLog[fx.coverageLog.length - 1]!;
    };

    // Pristine: every doc-level shared family rides the CDN credential.
    const before = await accessFor('alice');
    expect(before.resourceIds).toEqual(
      expect.arrayContaining([
        'page-render',
        'page-render-annotated',
        'page-annotations',
        'page-text',
        'page-geometry',
        'layout',
        'metadata',
        'actions',
        'attachments',
        'layer-page-render',
      ]),
    );

    // Annotation write: exactly the annotations-dependent families go.
    await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/annotations/pages/1/items`, {
      method: 'POST',
      headers: { ...auth(docToken(tenantId, docId, 'alice')), 'Content-Type': 'application/json' },
      body: JSON.stringify(highlightDraft()),
    });
    const afterAnno = await accessFor('alice');
    expect(afterAnno.resourceIds).not.toEqual(expect.arrayContaining(['page-annotations']));
    expect(afterAnno.resourceIds).not.toEqual(expect.arrayContaining(['page-render-annotated']));
    expect(afterAnno.resourceIds).toEqual(
      expect.arrayContaining(['page-render', 'page-text', 'attachments', 'layout']),
    );

    // Page delete: the content trio + layout follow.
    await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/pages/delete`, {
      method: 'POST',
      headers: { ...auth(docToken(tenantId, docId, 'alice')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageObjectNumbers: [2] }),
    });
    const afterDelete = await accessFor('alice');
    for (const gone of ['page-render', 'page-text', 'page-geometry', 'layout']) {
      expect(afterDelete.resourceIds, gone).not.toEqual(expect.arrayContaining([gone]));
    }
    expect(afterDelete.resourceIds).toEqual(
      expect.arrayContaining(['layer-page-render', 'attachments', 'metadata']),
    );

    // Bob's untouched layer keeps the full grant.
    const bob = await accessFor('bob');
    expect(bob.resourceIds).toEqual(
      expect.arrayContaining(['page-render', 'page-render-annotated', 'page-annotations']),
    );
  });

  test('encrypted docs: password sessions bind to the CLAIMED layer for shared reads', async () => {
    const tenantId = 'tenant-enc';
    const docId = 'docenc0000001';
    await seedDocument(fx, tenantId, docId, {
      security: {
        encryptionState: 'encrypted',
        encryptionRequiresPassword: true,
        securityHandlerRevision: 6,
      },
    });
    const aliceAuth = auth(docToken(tenantId, docId, 'alice'));
    const shared = `${fx.baseUrl}/v1/docs/${docId}/text/pages/1/data@contentVersion=1`;

    // Locked: the shared read refuses until alice unlocks HER layer.
    const blocked = await fetch(shared, { headers: aliceAuth });
    expect(blocked.status, await blocked.clone().text()).toBe(422);

    const access = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: { ...aliceAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, layerName: 'alice', password: 'Test', mode: 'any' }),
    });
    expect(access.status, await access.clone().text()).toBe(200);

    // The session is bound to layer "alice" — and the shared doc-level read
    // must honor exactly that binding (execution on the base session,
    // authorization by the claimed layer).
    expect((await fetch(shared, { headers: aliceAuth })).status).toBe(200);

    // Bob never unlocked: the (now warm) base must still refuse him.
    expect((await fetch(shared, { headers: auth(docToken(tenantId, docId, 'bob')) })).status).toBe(
      422,
    );
  });
});

describe('WS2b attachments plane (independent axis)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  });

  afterAll(async () => {
    await tearDown(fx);
  });

  const ATT_TOKEN = 'attachmentsVersion=1';

  test('undiverged layers list attachments at ONE shared base URL — zero layer sessions', async () => {
    const tenantId = 'tenant-attshare';
    const docId = 'docattshare01';
    await seedDocument(fx, tenantId, docId);
    const spy = spyWorkerBuilds(fx);

    for (const layer of ['alice', 'bob']) {
      const manifest = await fetchLayerManifest(fx, tenantId, docId, layer);
      expect(manifest.scopes?.attachments).toBe('base');
    }

    const url = `${fx.baseUrl}/v1/docs/${docId}/attachments@${ATT_TOKEN}`;
    const a = await fetch(url, { headers: auth(docToken(tenantId, docId, 'alice')) });
    const b = await fetch(url, { headers: auth(docToken(tenantId, docId, 'bob')) });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.headers.get('cache-control')).toContain('immutable');
    // The sidebar-on-open economics: base session only, no layer sessions.
    expect(spy.count('open.layerFileBase')).toBe(0);
  });

  test('an attachment write flips ONLY the attachments plane; content keeps sharing', async () => {
    const tenantId = 'tenant-attflip';
    const docId = 'docattflip001';
    await seedDocument(fx, tenantId, docId);

    // Mint alice's layer row via an annotation write (attachmentsVersion
    // stays at base epoch), then simulate the attachment write's version
    // bump directly — the create route needs a multipart envelope + real
    // engine bake, which the scope computation does not care about.
    const created = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/alice/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: {
          ...auth(docToken(tenantId, docId, 'alice')),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(highlightDraft()),
      },
    );
    expect(created.status).toBe(200);
    await fx.db
      .updateTable('layers')
      .set({ attachments_version: 2 })
      .where('doc_id', '=', docId)
      .where('name', '=', 'alice')
      .execute();

    // The attachments plane flips (annotations flipped by the minting
    // write); the CONTENT plane is untouched.
    const alice = await fetchLayerManifest(fx, tenantId, docId, 'alice');
    expect(alice.scopes).toEqual({ ...ALL_BASE, annotations: 'layer', attachments: 'layer' });

    // Origin: base attachments refused for alice, granted for bob; base
    // CONTENT still fine for alice (the guards are per-plane).
    const attUrl = `${fx.baseUrl}/v1/docs/${docId}/attachments@${ATT_TOKEN}`;
    expect(
      (await fetch(attUrl, { headers: auth(docToken(tenantId, docId, 'alice')) })).status,
    ).toBe(404);
    expect((await fetch(attUrl, { headers: auth(docToken(tenantId, docId, 'bob')) })).status).toBe(
      200,
    );
    const renderUrl = `${fx.baseUrl}/v1/docs/${docId}/render/pages/1/data@${W320_TOKEN}`;
    expect(
      (await fetch(renderUrl, { headers: auth(docToken(tenantId, docId, 'alice')) })).status,
    ).toBe(200);

    // Edge grant mirrors: attachments pair withheld, content trio kept.
    const res = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: { ...auth(docToken(tenantId, docId, 'alice')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, layerName: 'alice' }),
    });
    expect(res.status).toBe(200);
    const grant = fx.coverageLog[fx.coverageLog.length - 1]!;
    expect(grant.resourceIds).not.toEqual(expect.arrayContaining(['attachments']));
    expect(grant.resourceIds).toEqual(expect.arrayContaining(['page-render', 'layer-attachments']));
  });

  test('a CONTENT op leaves attachment sharing intact (cross-plane independence)', async () => {
    const tenantId = 'tenant-attkeep';
    const docId = 'docattkeep001';
    await seedDocument(fx, tenantId, docId);

    // Delete = a real content op under the plane model (rotate no longer
    // is — it owns layout only).
    const deleted = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/alice/pages/delete`, {
      method: 'POST',
      headers: { ...auth(docToken(tenantId, docId, 'alice')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageObjectNumbers: [2] }),
    });
    expect(deleted.status).toBe(200);

    const alice = await fetchLayerManifest(fx, tenantId, docId, 'alice');
    // Content flipped, attachments did NOT — a redacted/edited layer still
    // shares the base attachments it never touched.
    expect(alice.scopes?.content).toBe('layer');
    expect(alice.scopes?.attachments).toBe('base');

    const attUrl = `${fx.baseUrl}/v1/docs/${docId}/attachments@${ATT_TOKEN}`;
    expect(
      (await fetch(attUrl, { headers: auth(docToken(tenantId, docId, 'alice')) })).status,
    ).toBe(200);
  });
});

/* ------------------------------------------------------------------ */

async function buildFixture(): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'view-sharing-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'view-sharing-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const coverageLog: Fixture['coverageLog'] = [];
  // A coverage-capturing signer: surfaces exactly what the edge would be
  // credentialed for, without any real CDN in the loop.
  const stubSigner: CdnSigner = {
    info: { kind: 'custom-hmac' },
    buildAccess(input: SignInput) {
      coverageLog.push({
        layerName: input.layerName,
        resourceIds: input.coverage.map((c) => c.resourceId),
      });
      return {
        adapter: 'custom-hmac',
        expiresAt: input.expiresAt,
        cache: { scope: 'edge-shared', immutableVersionedReads: true },
        baseUrlOverrides: null,
        authHeader: null,
        signedQueryParams: null,
        signedCookies: null,
        signedPathPolicies: input.coverage.map((c) => ({
          pathPrefix: c.pathPrefix,
          queryParams: {},
        })),
      };
    },
    purge: () => Promise.resolve({ kind: 'no-op' as const }),
  } as unknown as CdnSigner;
  const bundle = await buildApp({
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    cdnSigner: stubSigner,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 64 * 1024 * 1024,
    // Password-session storage (the encrypted claimed-layer test).
    kms: new StaticKmsKeyring({
      keyId: 'test-password-session-kek',
      kek: Buffer.alloc(32, 7),
    }),
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return { bundle, app: bundle.app, db, baseUrl, storageRoot, cacheRoot, coverageLog };
}

async function tearDown(fx: Fixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function docToken(tenantId: string, docId: string, layerName: string): string {
  return signDevToken(SECRET, {
    sub: `user-${layerName}`,
    // Stable per-visitor jti + unlock key: password sessions bind to
    // (jti, layer) and decrypt with the token's unlock key, so repeated
    // token mints for the same visitor must agree.
    jti: `jti-${layerName}`,
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
    extras: {
      embedpdf: { unlock_key: Buffer.alloc(32, `uk-${layerName}`).toString('base64url') },
    },
  });
}

function adminToken(tenantId: string): string {
  return signDevToken(SECRET, { sub: 'admin-1', tenant_id: tenantId, scope: ['*'] });
}

/** Stub-PDF bytes: byte0 = pageCount. */
async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: {
    security?: {
      encryptionState: 'unknown' | 'none' | 'encrypted' | 'unsupported';
      encryptionRequiresPassword: boolean | null;
      securityHandlerRevision?: number | null;
    };
  } = {},
): Promise<void> {
  const bytes = new Uint8Array(4096);
  bytes[0] = 2;
  bytes.set(randomBytes(4094), 2);
  bytes[1] = 0;
  const sha = createHash('sha256').update(bytes).digest('hex');
  const storage = new FsObjectStore({ root: fx.storageRoot });
  await storage.put(StorageKeys.basePdf(tenantId, docId), bytes, {
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
            security_probed_at: now,
          }
        : {}),
    })
    .execute();
}

interface WireManifest {
  scopes?: Record<string, string>;
  pages: Array<{
    state: { pageObjectNumber: number };
    cache: { contentVersion: number; annotationVersion: number };
  }>;
}

async function fetchLayerManifest(
  fx: Fixture,
  tenantId: string,
  docId: string,
  layerName: string,
): Promise<WireManifest> {
  const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest`, {
    headers: auth(docToken(tenantId, docId, layerName)),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as WireManifest;
}

/** Count worker dispatches by wire kind through the bundle's pool. */
function spyWorkerBuilds(fx: Fixture): { count: (kind: string) => number } {
  const pool = fx.bundle.pool as unknown as {
    run: (
      docId: string,
      build: (id: number) => { payload: { kind: string } },
      s?: unknown,
    ) => Promise<unknown>;
  };
  const counts = new Map<string, number>();
  const original = pool.run.bind(pool);
  pool.run = async (docId, build, s) => {
    const wrapped = (id: number) => {
      const pack = build(id);
      counts.set(pack.payload.kind, (counts.get(pack.payload.kind) ?? 0) + 1);
      return pack;
    };
    return original(docId, wrapped as never, s as never);
  };
  return { count: (kind) => counts.get(kind) ?? 0 };
}

function highlightDraft(): unknown {
  return {
    subtype: 'highlight',
    quadPoints: [
      { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, p3: { x: 0, y: 10 }, p4: { x: 10, y: 10 } },
    ],
  };
}
