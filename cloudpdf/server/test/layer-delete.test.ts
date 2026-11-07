/**
 * Deleting a layer (`DELETE /v1/tenants/:tenantId/documents/:id/layers/:layerName`),
 * on the native engine: what the layer stored goes (artifacts, renders,
 * change captures, changes, audit rows, object numbers), a written
 * layer stays as a tombstone whose name every route refuses
 * (`LayerDeleted`, 410), a layer nobody wrote stays usable, and a layer a
 * grant uses is not deleted. The race with a write on another replica
 * is at the end, on the stub worker.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { OBJECT_NUMBER_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
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
import {
  createAnnotation,
  holdNextUpload,
  listAnnotations,
  makeReplicaCluster,
  type ReplicaCluster,
} from './_helpers/two-replica-harness';

const SECRET = 'layer-delete-secret';
const API_TOKEN = 'layer-delete-root-token';
const TENANT = 'tenant-layer-delete';
const DOC = 'doc-layer-delete';
/** The fixture's second page: empty. */
const PAGE = 4;

let dir: string;
let storageRoot: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'layer-delete-'));
  storageRoot = join(dir, 'objects');
  db = createSqliteDb({ path: join(dir, 'server.db') });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    apiAuthTokens: [API_TOKEN],
    workerEntry: new URL('../dist/runtime/worker-entry.js', import.meta.url),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: join(dir, 'cache'),
    cacheMaxBytes: 4 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;

  const bytes = OBJECT_NUMBER_FIXTURE_PDF;
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, {
    contentLength: bytes.byteLength,
  });
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await db
    .insertInto('documents')
    .values({
      id: DOC,
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
}, 60_000);

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await rm(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

async function request(
  method: string,
  url: string,
  token: string,
  opts: { body?: unknown; session?: string } = {},
): Promise<Answer> {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.session ? { 'X-Engine-Session-Id': opts.session } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const docToken = (layer: string) =>
  signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: TENANT,
    doc_id: DOC,
    layer_name: layer,
    scope: ['*'],
  });

/** A call on the layer's own routes, as its user. */
const onLayer = (
  method: string,
  layer: string,
  path: string,
  opts?: { body?: unknown; session?: string },
) => request(method, `/v1/docs/${DOC}/layers/${layer}${path}`, docToken(layer), opts);

const deleteLayer = (layer: string, token = API_TOKEN, doc = DOC) =>
  request('DELETE', `/v1/tenants/${TENANT}/documents/${doc}/layers/${layer}`, token);

const square = { subtype: 'square', box: { x: 20, y: 120, width: 40, height: 30 } };
const createSquare = (layer: string) =>
  onLayer('POST', layer, `/annotations/pages/obj:${PAGE}/items`, { body: square });

const refused = (answer: Answer, layer: string) => {
  expect(answer.status).toBe(410);
  expect(answer.body.error).toMatchObject({
    code: 'LayerDeleted',
    details: { docId: DOC, layerName: layer },
  });
};

/** The stored objects under a prefix (the fs store maps keys to paths). */
async function storedUnder(prefix: string): Promise<string[]> {
  try {
    return (await readdir(join(storageRoot, prefix), { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

const layerRow = (layer: string) =>
  db
    .selectFrom('layers')
    .selectAll()
    .where('doc_id', '=', DOC)
    .where('name', '=', layer)
    .executeTakeFirst();

/** How many rows of each kind the layer still has. */
async function rowsOf(layer: string) {
  const row = await layerRow(layer);
  const byLayerId = async (table: 'layer_pages' | 'change_outcomes' | 'audit_log') =>
    row
      ? (
          await db
            .selectFrom(table)
            .select(db.fn.countAll<number>().as('n'))
            .where('layer_id', '=', row.id)
            .executeTakeFirstOrThrow()
        ).n
      : 0;
  const byName = async (
    table: 'object_number_counters' | 'edit_sessions' | 'object_number_blocks',
  ) =>
    (
      await db
        .selectFrom(table)
        .select(db.fn.countAll<number>().as('n'))
        .where('doc_id', '=', DOC)
        .where('layer_name', '=', layer)
        .executeTakeFirstOrThrow()
    ).n;
  return {
    pages: Number(await byLayerId('layer_pages')),
    changes: Number(await byLayerId('change_outcomes')),
    audit: Number(await byLayerId('audit_log')),
    counters: Number(await byName('object_number_counters')),
    sessions: Number(await byName('edit_sessions')),
    blocks: Number(await byName('object_number_blocks')),
  };
}

describe('deleting a written layer', () => {
  test('removes what it stored and leaves a tombstone', async () => {
    const layer = 'alice';
    expect(
      (await onLayer('POST', layer, '/access', { body: {}, session: 'cloud:alice' })).status,
    ).toBe(200);
    expect((await createSquare(layer)).status).toBe(200);
    const changed = await onLayer('POST', layer, '/changes', {
      body: {
        changes: [
          {
            opId: 'alice-1',
            ops: [
              {
                type: 'annotations.create',
                page: { kind: 'objectNumber', objectNumber: PAGE },
                data: square,
              },
            ],
          },
        ],
      },
    });
    expect(changed.status).toBe(200);
    const prefix = StorageKeys.layerRoot(TENANT, DOC, layer);
    expect(await storedUnder(prefix)).not.toEqual([]);
    const before = await rowsOf(layer);
    expect(before).toMatchObject({ counters: 1, sessions: 1 });
    expect(before.pages).toBeGreaterThan(0);
    expect(before.changes).toBeGreaterThan(0);
    expect(before.audit).toBeGreaterThan(0);

    expect((await deleteLayer(layer)).status).toBe(204);
    expect(await layerRow(layer)).toMatchObject({
      current_artifact_key: null,
      deleted_at: expect.any(Number),
    });
    expect(await rowsOf(layer)).toEqual({
      // The tombstone keeps its pages' version counters; nothing else.
      pages: before.pages,
      changes: 0,
      audit: 0,
      counters: 0,
      sessions: 0,
      blocks: 0,
    });
    expect(await storedUnder(prefix)).toEqual([]);
    // Again: nothing more to do.
    expect((await deleteLayer(layer)).status).toBe(204);
  });

  test('its name is refused on every route from then on', async () => {
    const layer = 'refused';
    expect((await createSquare(layer)).status).toBe(200);
    expect((await deleteLayer(layer)).status).toBe(204);

    refused(await onLayer('GET', layer, '/manifest'), layer);
    refused(await onLayer('POST', layer, '/access', { body: {}, session: 'cloud:again' }), layer);
    refused(await createSquare(layer), layer);
    refused(await onLayer('GET', layer, `/annotations/pages/obj:${PAGE}/items`), layer);
    refused(
      await onLayer('POST', layer, '/object-numbers', {
        body: { count: 4 },
        session: 'cloud:again',
      }),
      layer,
    );
    refused(await onLayer('GET', layer, '/events'), layer);
    // Not made again by a write, and no grant can name it.
    expect((await layerRow(layer))?.deleted_at).not.toBeNull();
    refused(
      await request('POST', `/v1/tenants/${TENANT}/grants`, API_TOKEN, {
        body: { docId: DOC, layerName: layer, scope: ['doc.open'] },
      }),
      layer,
    );
  });

  test("leaves the document's other layers as they were", async () => {
    expect((await createSquare('kept')).status).toBe(200);
    expect((await createSquare('dropped')).status).toBe(200);
    expect((await deleteLayer('dropped')).status).toBe(204);

    const listed = await onLayer('GET', 'kept', `/annotations/pages/obj:${PAGE}/items`);
    expect(listed.status).toBe(200);
    expect(listed.body.annotations).toHaveLength(1);
    expect((await onLayer('GET', 'kept', '/manifest')).status).toBe(200);
    expect(await storedUnder(StorageKeys.layerRoot(TENANT, DOC, 'kept'))).not.toEqual([]);
  });
});

describe('deleting a layer nobody wrote', () => {
  test('drops its object numbers, leaves no tombstone, and its name stays usable', async () => {
    const layer = 'carol';
    expect(
      (await onLayer('POST', layer, '/access', { body: {}, session: 'cloud:carol' })).status,
    ).toBe(200);
    expect(await rowsOf(layer)).toMatchObject({ counters: 1, sessions: 1, blocks: 1 });

    expect((await deleteLayer(layer)).status).toBe(204);
    expect(await layerRow(layer)).toBeUndefined();
    expect(await rowsOf(layer)).toMatchObject({ counters: 0, sessions: 0, blocks: 0 });
    expect((await createSquare(layer)).status).toBe(200);
  });
});

describe('what is refused', () => {
  test('a layer a grant uses, until the grant is deleted', async () => {
    const layer = 'linked';
    expect((await createSquare(layer)).status).toBe(200);
    const grant = await request('POST', `/v1/tenants/${TENANT}/grants`, API_TOKEN, {
      body: { docId: DOC, layerName: layer, scope: ['doc.open'] },
    });
    expect(grant.status).toBe(200);

    const blocked = await deleteLayer(layer);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({
      code: 'Conflict',
      details: { grantIds: [grant.body.grant.id] },
    });
    expect((await layerRow(layer))?.deleted_at).toBeNull();

    const unlinked = await request(
      'DELETE',
      `/v1/tenants/${TENANT}/grants/${grant.body.grant.id}`,
      API_TOKEN,
    );
    expect(unlinked.status).toBe(204);
    expect((await deleteLayer(layer)).status).toBe(204);
  });

  test("another tenant's token, a token without docs.delete, and an unknown document", async () => {
    expect((await createSquare('guarded')).status).toBe(200);
    const stranger = signDevToken(SECRET, {
      sub: 'other',
      tenant_id: 'tenant-other',
      scope: ['*'],
    });
    expect((await deleteLayer('guarded', stranger)).status).toBe(403);
    const reader = signDevToken(SECRET, { sub: 'reader', tenant_id: TENANT, scope: ['docs.read'] });
    expect((await deleteLayer('guarded', reader)).status).toBe(403);
    expect((await deleteLayer('guarded', API_TOKEN, 'doc-missing')).status).toBe(404);
    expect((await layerRow('guarded'))?.deleted_at).toBeNull();
  });
});

describe('a write in flight on another replica', () => {
  const TENANT_R = 'tenant-delete-replicas';
  const DOC_R = 'docdeletereplicas';
  const LAYER = 'racing';
  let cluster: ReplicaCluster;

  beforeEach(async () => {
    cluster = await makeReplicaCluster(2);
    await cluster.seedDocument(TENANT_R, DOC_R, { pageCount: 2 });
  });

  afterEach(async () => {
    await cluster.teardown();
  });

  test('loses its commit to the delete, and its retry finds the name deleted', async () => {
    const [a, b] = cluster.replicas;
    const input = { tenantId: TENANT_R, docId: DOC_R, layerName: LAYER, contents: 'first' };
    expect((await createAnnotation(a!, input)).status).toBe(200);

    const hold = holdNextUpload(b!);
    const racing = createAnnotation(b!, { ...input, contents: 'racing' });
    await hold.held;
    await a!.bundle.layerService!.deleteLayer(TENANT_R, { docId: DOC_R, layerName: LAYER });
    hold.release();

    const answer = await racing;
    expect(answer.status).toBe(410);
    expect(answer.body).toMatchObject({ error: { code: 'LayerDeleted' } });
    const listed = await listAnnotations(a!, {
      tenantId: TENANT_R,
      docId: DOC_R,
      layerName: LAYER,
    }).catch((err: unknown) => err);
    expect(listed).toBeInstanceOf(Error);
    const prefix = StorageKeys.layerRoot(TENANT_R, DOC_R, LAYER);
    expect(await cluster.storage.deletePrefix(prefix)).toEqual({ deleted: 0 });
  });
});
