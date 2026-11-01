/**
 * A layer's download, on the native engine. Incremental (the default) is
 * the base file followed by the delta the layer's artifact stores, sent
 * without the engine; it opens to the same document as the engine's own
 * incremental save and its rewrite. A layer nobody wrote is the base file.
 * A rewrite still goes through the engine, and every download keeps its
 * permission check.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import { wirePaths } from '@embedpdf/engine-core/wire';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import { readLayerArtifactHeader } from '../src/storage/layerArtifact';

const SECRET = 'layer-download-secret';
const TENANT = 'tenant-layer-download';
const DOC = 'doc-layer-download';
/** The fixture's first page: a square, a note with its popup and reply, and the `name` field's widget (9). */
const PAGE = 3;
const WIDGET = 9;

let dir: string;
let storageRoot: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;
/** Worker jobs dispatched, as `kind:layerName`. */
const jobs: string[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'layer-download-'));
  storageRoot = join(dir, 'objects');
  db = createSqliteDb({ path: join(dir, 'server.db') });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: new URL('../dist/runtime/worker-entry.js', import.meta.url),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: join(dir, 'cache'),
    cacheMaxBytes: 8 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  await seed(DOC, CHANGE_FIXTURE_PDF);

  type Build = (jobId: number) => { payload: { kind: string; layerName?: string } };
  const pool = bundle.pool as unknown as {
    run: (docId: string, build: Build, signal?: unknown) => Promise<unknown>;
  };
  const run = pool.run.bind(pool);
  pool.run = (docId, build, signal) =>
    run(
      docId,
      (jobId) => {
        const pack = build(jobId);
        jobs.push(`${pack.payload.kind}:${pack.payload.layerName ?? ''}`);
        return pack;
      },
      signal,
    );
}, 60_000);

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await rm(dir, { recursive: true, force: true });
});

/** A ready document whose base file is `bytes`. */
async function seed(docId: string, bytes: Uint8Array): Promise<void> {
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, docId), bytes, {
    contentLength: bytes.byteLength,
  });
  const now = Date.now();
  await db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: TENANT,
      state: 'ready',
      base_sha: createHash('sha256').update(bytes).digest('hex'),
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

const token = (docId: string, layer: string, scope: string[] = ['*']) =>
  signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: TENANT,
    doc_id: docId,
    layer_name: layer,
    scope,
  });

async function call(
  method: string,
  docId: string,
  layer: string,
  path: string,
  opts: { body?: unknown; scope?: string[] } = {},
) {
  const res = await fetch(`${baseUrl}/v1/docs/${docId}/layers/${layer}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(docId, layer, opts.scope)}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return res;
}

const json = async (res: Response) => {
  expect(res.status, await res.clone().text()).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  return (await res.json()) as any;
};

const bytesOf = async (res: Response) => {
  expect(res.status, res.status === 200 ? '' : await res.clone().text()).toBe(200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(Number(res.headers.get('content-length'))).toBe(bytes.byteLength);
  return bytes;
};

/** Jobs `run` dispatched to the worker. */
async function jobsDuring<T>(run: () => Promise<T>): Promise<{ result: T; dispatched: string[] }> {
  const from = jobs.length;
  const result = await run();
  return { result, dispatched: jobs.slice(from) };
}

/** What a document's layer holds, as the engine reads it: page 3's annotations and the form. */
async function contentOf(docId: string, layer: string) {
  const annotations = await json(
    await call('GET', docId, layer, `/annotations/pages/obj:${PAGE}/items`),
  );
  const form = await json(await call('GET', docId, layer, '/form'));
  return {
    annotations: (
      annotations.annotations as Array<{ subtype: string; contents: string | null; rect: unknown }>
    ).map(({ subtype, contents, rect }) => ({ subtype, contents, rect })),
    fields: (form.fields as Array<{ name: string; value: unknown }>).map(({ name, value }) => ({
      name,
      value,
    })),
  };
}

/** Write to the layer: one square more, and the `name` field filled in. */
async function edit(layer: string): Promise<void> {
  await json(
    await call('POST', DOC, layer, `/annotations/pages/obj:${PAGE}/items`, {
      body: {
        subtype: 'square',
        box: { x: 150, y: 150, width: 40, height: 30 },
        contents: 'added',
      },
    }),
  );
  await json(
    await call('POST', DOC, layer, `/form/fields/obj:${WIDGET}/value`, {
      body: { value: { value: 'Bea' } },
    }),
  );
}

describe('an incremental download', () => {
  test('is the base file followed by the stored delta, sent without the engine', async () => {
    const layer = 'edited';
    await edit(layer);
    const { result: bytes, dispatched } = await jobsDuring(async () =>
      bytesOf(await call('GET', DOC, layer, '/download')),
    );
    expect(dispatched).toEqual([]);

    const row = await db
      .selectFrom('layers')
      .select('current_artifact_key')
      .where('doc_id', '=', DOC)
      .where('name', '=', layer)
      .executeTakeFirstOrThrow();
    const artifactPath = join(storageRoot, row.current_artifact_key!);
    const artifact = new Uint8Array(await readFile(artifactPath));
    const header = (await readLayerArtifactHeader(artifactPath, artifact.byteLength))!;
    expect(header.deltaSize).toBeGreaterThan(0);
    expect(bytes.byteLength).toBe(CHANGE_FIXTURE_PDF.byteLength + header.deltaSize);
    expect(bytes.subarray(0, CHANGE_FIXTURE_PDF.byteLength)).toEqual(CHANGE_FIXTURE_PDF);
    expect(bytes.subarray(CHANGE_FIXTURE_PDF.byteLength)).toEqual(
      artifact.subarray(header.deltaOffset, header.deltaOffset + header.deltaSize),
    );
  });

  test("opens to the same document as the engine's own incremental save and its rewrite", async () => {
    const layer = 'compared';
    await edit(layer);
    const direct = await bytesOf(await call('GET', DOC, layer, '/download'));
    const saved = await bundle.documentService!.saveLayerDownloadToTemp(
      { tenantId: TENANT, sub: 'user-1' },
      DOC,
      layer,
      'incremental',
    );
    const engine = new Uint8Array(await readFile(saved.path));
    await saved.cleanup();
    const rewrite = await bytesOf(await call('GET', DOC, layer, '/download?mode=rewrite'));

    const expected = await contentOf(DOC, layer);
    expect(expected.annotations.map((a) => a.contents)).toContain('added');
    expect(expected.fields).toContainEqual({ name: 'name', value: 'Bea' });
    for (const [docId, bytes] of [
      ['doc-dl-direct', direct],
      ['doc-dl-engine', engine],
      ['doc-dl-rewrite', rewrite],
    ] as const) {
      await seed(docId, bytes);
      expect(await contentOf(docId, 'default')).toEqual(expected);
    }
  });

  test('of a layer nobody wrote is the base file', async () => {
    const { result: bytes, dispatched } = await jobsDuring(async () =>
      bytesOf(await call('GET', DOC, 'untouched', '/download')),
    );
    expect(dispatched).toEqual([]);
    expect(bytes).toEqual(CHANGE_FIXTURE_PDF);
  });

  test('at a version is sent without the engine too, and a stale version is refused', async () => {
    const layer = 'versioned';
    await edit(layer);
    const { docVersion } = await json(await call('GET', DOC, layer, '/manifest'));
    const path = (version: number) =>
      wirePaths
        .layerDownloadVersioned(DOC, layer, { docVersion: version, mode: 'incremental' })
        .replace(`/v1/docs/${DOC}/layers/${layer}`, '');
    const { result: bytes, dispatched } = await jobsDuring(async () =>
      bytesOf(await call('GET', DOC, layer, path(docVersion))),
    );
    expect(dispatched).toEqual([]);
    expect(bytes).toEqual(
      new Uint8Array(await (await call('GET', DOC, layer, '/download')).arrayBuffer()),
    );
    expect((await call('GET', DOC, layer, path(docVersion - 1))).status).toBe(404);
  });
});

describe('every download', () => {
  test('a rewrite still saves through the engine', async () => {
    const { dispatched } = await jobsDuring(async () =>
      bytesOf(await call('GET', DOC, 'edited', '/download?mode=rewrite')),
    );
    expect(dispatched.some((job) => job.startsWith('document.saveFile:'))).toBe(true);
  });

  test('needs doc.download, incremental or not', async () => {
    for (const query of ['', '?mode=rewrite']) {
      const res = await call('GET', DOC, 'edited', `/download${query}`, { scope: ['doc.open'] });
      expect(res.status).toBe(403);
    }
  });
});

describe('a download link', () => {
  const mint = (layer: string, body: unknown = {}, scope?: string[]) =>
    call('POST', DOC, layer, '/download-link', { body, ...(scope ? { scope } : {}) });
  /** A link a backend makes itself (a JWKS deployment does), for `docVersion`. */
  const handMade = (layer: string, docVersion: number, ttlSeconds = 300) =>
    signDevToken(SECRET, {
      sub: 'backend',
      tenant_id: TENANT,
      doc_id: DOC,
      layer_name: layer,
      scope: ['doc.download'],
      ttlSeconds,
      extras: { download: { docVersion, mode: 'incremental' } },
    });
  const versionedUrl = (layer: string, docVersion: number) =>
    `${baseUrl}${wirePaths.layerDownloadVersioned(DOC, layer, { docVersion, mode: 'incremental' })}`;

  test('downloads the layer with a plain GET, without the engine, and is not cached', async () => {
    const layer = 'linked';
    await edit(layer);
    const made = await json(await mint(layer, { expiresIn: 120 }));
    expect(made.url).toMatch(
      new RegExp(`^${baseUrl}/v1/docs/${DOC}/layers/${layer}/download@.+\\?link=`),
    );
    expect(made.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 100);

    const { result: res, dispatched } = await jobsDuring(() => fetch(made.url));
    const bytes = await bytesOf(res);
    expect(dispatched).toEqual([]);
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(bytes).toEqual(await bytesOf(await call('GET', DOC, layer, '/download')));
  });

  test('opens only its download: not as a bearer token, not elsewhere, and no session token works as one', async () => {
    const layer = 'linked';
    const made = await json(await mint(layer));
    const linkToken = new URL(made.url).searchParams.get('link')!;
    const downloadPath = new URL(made.url).pathname;

    const asBearer = await fetch(`${baseUrl}${downloadPath}`, {
      headers: { Authorization: `Bearer ${linkToken}` },
    });
    expect(asBearer.status).toBe(401);
    const elsewhere = await fetch(
      `${baseUrl}/v1/docs/${DOC}/layers/${layer}/manifest?link=${encodeURIComponent(linkToken)}`,
    );
    expect(elsewhere.status).toBe(401);
    const otherLayer = await fetch(
      `${versionedUrl('compared', 2)}?link=${encodeURIComponent(linkToken)}`,
    );
    expect(otherLayer.status).toBe(401);
    const sessionToken = await fetch(
      `${baseUrl}${downloadPath}?link=${encodeURIComponent(token(DOC, layer))}`,
    );
    expect(sessionToken.status).toBe(401);
  });

  test('answers 404 once the layer changes, and refuses another version or an expired link', async () => {
    const layer = 'moving';
    await edit(layer);
    const made = await json(await mint(layer));
    expect((await fetch(made.url)).status).toBe(200);
    await edit(layer);
    expect((await fetch(made.url)).status).toBe(404);

    const { docVersion } = await json(await call('GET', DOC, layer, '/manifest'));
    const fresh = handMade(layer, docVersion);
    expect((await fetch(`${versionedUrl(layer, docVersion)}?link=${fresh}`)).status).toBe(200);
    const wrongVersion = await fetch(`${versionedUrl(layer, docVersion - 1)}?link=${fresh}`);
    expect(wrongVersion.status).toBe(403);
    const expired = handMade(layer, docVersion, -60);
    expect((await fetch(`${versionedUrl(layer, docVersion)}?link=${expired}`)).status).toBe(401);
    const withMore = await fetch(`${versionedUrl(layer, docVersion)}?link=${fresh}&mode=rewrite`);
    expect(withMore.status).toBe(400);
  });

  test('making one needs doc.download, and an expiry in range', async () => {
    expect((await mint('linked', {}, ['doc.open'])).status).toBe(403);
    expect((await mint('linked', { expiresIn: 30 })).status).toBe(400);
    expect((await mint('linked', { expiresIn: 7200 })).status).toBe(400);
  });
});
