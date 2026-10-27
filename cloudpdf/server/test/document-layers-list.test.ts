/**
 * `GET /v1/tenants/:tenantId/documents/:id/layers`: a document's layers that
 * hold changes, newest first, paged like the other tenant lists (`limit`,
 * an opaque keyset `cursor`, `nextCursor` null on the last page). Named and
 * shared layers are listed with share-link visitors' own; `shareId` keeps
 * one link's visitors, an archived link's too. A layer appears at its first
 * change, and a deleted one is not listed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
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
import { highlightDraft } from './_helpers/two-replica-harness';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'layers-list-secret';
const API_TOKEN = 'layers-list-root-token';
const TENANT = 'tenant-layers-list';
const ORIGIN = 'https://acme.example';

let dir: string;
let storageRoot: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;
let docs = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'layers-list-'));
  storageRoot = join(dir, 'objects');
  db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    apiAuthTokens: [API_TOKEN],
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: join(dir, 'cache'),
    cacheMaxBytes: 1024 * 1024,
    corsOrigins: '*',
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
}, 60_000);

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await rm(dir, { recursive: true, force: true });
});

/** A fresh ready document of its own, so each test counts only its layers. */
async function seedDocument(): Promise<string> {
  const docId = `doc-layers-list-${++docs}`;
  const bytes = new Uint8Array(4096);
  bytes[0] = 2; // stub page count
  bytes.set(randomBytes(4094), 2);
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
  return docId;
}

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

async function call(
  method: string,
  url: string,
  opts: { token?: string; body?: unknown; origin?: string } = {},
): Promise<Answer> {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const listLayers = (docId: string, query = '', token = API_TOKEN) =>
  call('GET', `/v1/tenants/${TENANT}/documents/${docId}/layers${query}`, { token });

/** Write to a layer the way a backend's user token does. */
async function writeNamed(docId: string, layerName: string): Promise<void> {
  const token = signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: TENANT,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
  });
  const answer = await call(
    'POST',
    `/v1/docs/${docId}/layers/${layerName}/annotations/pages/obj:1/items`,
    { token, body: highlightDraft(layerName) },
  );
  expect(answer.status).toBe(200);
}

const createLink = async (docId: string, body: Record<string, unknown>) => {
  const answer = await call('POST', `/v1/tenants/${TENANT}/shares`, {
    token: API_TOKEN,
    body: { docId, scope: ['*'], ...body },
  });
  expect(answer.status).toBe(200);
  return answer.body.share as { id: string };
};

/** A visitor of the link; `write` makes their layer. */
async function visitor(shareId: string, write = true) {
  const exchanged = await call('POST', '/v1/share-sessions', {
    body: { shareToken: shareId },
    origin: ORIGIN,
  });
  expect(exchanged.status).toBe(200);
  const { token, layerName } = exchanged.body as { token: string; layerName: string };
  if (write) {
    const docId = (
      JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
        doc_id: string;
      }
    ).doc_id;
    const answer = await call(
      'POST',
      `/v1/docs/${docId}/layers/${layerName}/annotations/pages/obj:1/items`,
      { token, body: highlightDraft('visitor'), origin: ORIGIN },
    );
    expect(answer.status).toBe(200);
  }
  return layerName;
}

/** Every page of the list, following `nextCursor`. */
async function everyPage(docId: string, limit: number, extra = ''): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | null = null;
  do {
    const query: string = `?limit=${limit}${extra}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const answer = await listLayers(docId, query);
    expect(answer.status).toBe(200);
    pages.push(answer.body.layers.map((layer: { layerName: string }) => layer.layerName));
    cursor = answer.body.nextCursor;
  } while (cursor);
  return pages;
}

describe("a document's layers", () => {
  test('lists the layers that hold changes, newest first, with whose each is', async () => {
    const docId = await seedDocument();
    await writeNamed(docId, 'user-42');
    const shared = await createLink(docId, { layerName: 'review' });
    await visitor(shared.id);
    const perVisitor = await createLink(docId, { layerMode: 'per-visitor' });
    const visitorLayer = await visitor(perVisitor.id);
    // Looked, never wrote: no layer yet.
    await visitor(perVisitor.id, false);

    const answer = await listLayers(docId);
    expect(answer.status).toBe(200);
    expect(answer.body.nextCursor).toBeNull();
    expect(answer.body.layers.map((layer: { layerName: string }) => layer.layerName)).toEqual([
      visitorLayer,
      'review',
      'user-42',
    ]);
    const [own, review, named] = answer.body.layers;
    expect(own).toMatchObject({
      docId,
      shareId: perVisitor.id,
      visitorId: visitorLayer.slice('visitor-'.length),
      lastSeenAt: expect.any(Number),
      storageSizeBytes: expect.any(Number),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    for (const layer of [review, named]) {
      expect(layer).toMatchObject({ shareId: null, visitorId: null, lastSeenAt: null });
      expect(layer.storageSizeBytes).toBeGreaterThan(0);
    }
  });

  test('leaves a deleted layer out', async () => {
    const docId = await seedDocument();
    await writeNamed(docId, 'kept');
    await writeNamed(docId, 'removed');
    const deleted = await call(
      'DELETE',
      `/v1/tenants/${TENANT}/documents/${docId}/layers/removed`,
      { token: API_TOKEN },
    );
    expect(deleted.status).toBe(204);
    const answer = await listLayers(docId);
    expect(answer.body.layers.map((layer: { layerName: string }) => layer.layerName)).toEqual([
      'kept',
    ]);
  });

  test("shareId keeps one link's visitors' layers, an archived link's too", async () => {
    const docId = await seedDocument();
    await writeNamed(docId, 'user-1');
    const first = await createLink(docId, { layerMode: 'per-visitor' });
    const second = await createLink(docId, { layerMode: 'per-visitor' });
    const firsts = [await visitor(first.id), await visitor(first.id)];
    await visitor(second.id);

    const filtered = await listLayers(docId, `?shareId=${first.id}`);
    expect(filtered.status).toBe(200);
    expect(
      filtered.body.layers.map((layer: { layerName: string }) => layer.layerName).sort(),
    ).toEqual([...firsts].sort());

    const archived = await call('POST', `/v1/tenants/${TENANT}/shares/${first.id}/archive`, {
      token: API_TOKEN,
    });
    expect(archived.status).toBe(200);
    const afterArchive = await listLayers(docId, `?shareId=${first.id}`);
    expect(afterArchive.body.layers).toHaveLength(2);
  });
});

describe('paging', () => {
  test('pages through every layer exactly once, ties on the creation time included', async () => {
    const docId = await seedDocument();
    const names = ['a', 'b', 'c', 'd', 'e'];
    for (const name of names) await writeNamed(docId, name);
    // The same creation time for all: the id breaks the tie.
    await db.updateTable('layers').set({ created_at: 1 }).where('doc_id', '=', docId).execute();

    const pages = await everyPage(docId, 2);
    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(pages.flat().sort()).toEqual(names);
  });

  test('pages a filtered list too', async () => {
    const docId = await seedDocument();
    const link = await createLink(docId, { layerMode: 'per-visitor' });
    const theirs = [await visitor(link.id), await visitor(link.id), await visitor(link.id)];
    await writeNamed(docId, 'not-theirs');

    const pages = await everyPage(docId, 2, `&shareId=${link.id}`);
    expect(pages.map((page) => page.length)).toEqual([2, 1]);
    expect(pages.flat().sort()).toEqual([...theirs].sort());
  });

  test('refuses a limit out of range, a malformed cursor or shareId', async () => {
    const docId = await seedDocument();
    for (const query of ['?limit=0', '?limit=201', '?cursor=nope', '?shareId=shr_short']) {
      const answer = await listLayers(docId, query);
      expect(answer.status, query).toBe(400);
      expect(answer.body.error.code).toBe('InvalidArg');
    }
  });
});

describe('who may list', () => {
  test("a tenant token with docs.read; not another tenant's, not without the scope, not an unknown document", async () => {
    const docId = await seedDocument();
    await writeNamed(docId, 'listed');
    const reader = signDevToken(SECRET, {
      sub: 'backend',
      tenant_id: TENANT,
      scope: ['docs.read'],
    });
    expect((await listLayers(docId, '', reader)).status).toBe(200);

    const sharer = signDevToken(SECRET, {
      sub: 'backend',
      tenant_id: TENANT,
      scope: ['shares.manage'],
    });
    expect((await listLayers(docId, '', sharer)).status).toBe(403);
    const stranger = signDevToken(SECRET, {
      sub: 'other',
      tenant_id: 'tenant-other',
      scope: ['*'],
    });
    expect((await listLayers(docId, '', stranger)).status).toBe(403);
    expect((await listLayers('doc-missing-1')).status).toBe(404);
  });
});
