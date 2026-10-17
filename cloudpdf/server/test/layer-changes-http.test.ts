/**
 * `POST …/changes` on the native engine: each change applies on its own and
 * answers in order, retries get the same answers (refusals included), undo by
 * reference within a request and across requests, who may undo, the final
 * changes that end undo, bytes as multipart parts, the limits, single-op
 * routes as one change each, and the sweeper.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

const SECRET = 'layer-changes-http-secret';
const TENANT = 'tenant-changes-http';
const DOC = 'doc-changes-http';
/** The fixture's second page. */
const PAGE = 4;
const DAY = 24 * 60 * 60 * 1000;

let dir: string;
let storageRoot: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'layer-changes-http-'));
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

interface CallOptions {
  layer: string;
  sub?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

async function call(method: string, path: string, opts: CallOptions): Promise<Answer> {
  const token = signDevToken(SECRET, {
    sub: opts.sub ?? 'alice',
    tenant_id: TENANT,
    doc_id: DOC,
    layer_name: opts.layer,
    scope: ['*'],
  });
  const res = await fetch(`${baseUrl}/v1/docs/${DOC}/layers/${opts.layer}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    ...(opts.form ? { body: opts.form } : {}),
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const post = (layer: string, changes: unknown[], opts: Omit<CallOptions, 'layer'> = {}) =>
  call('POST', '/changes', { ...opts, layer, body: { changes } });

const page = { kind: 'objectNumber', objectNumber: PAGE } as const;

const create = (x: number) => ({
  type: 'annotations.create',
  page,
  data: { subtype: 'square', box: { x, y: 120, width: 40, height: 30 } },
});

const missing = { kind: 'objectNumber', page, objectNumber: 9999 } as const;

/** The squares on the page, by their left edge. */
async function lefts(layer: string): Promise<number[]> {
  const listed = await call('GET', `/annotations/pages/obj:${PAGE}/items`, { layer });
  expect(listed.status).toBe(200);
  return listed.body.annotations
    .map((annotation: { box: { x: number } }) => Math.round(annotation.box.x))
    .sort((a: number, b: number) => a - b);
}

async function annotationOf(layer: string, objectNumber: number) {
  const listed = await call('GET', `/annotations/pages/obj:${PAGE}/items`, { layer });
  return listed.body.annotations.find(
    (annotation: { ref: { objectNumber: number } }) => annotation.ref.objectNumber === objectNumber,
  );
}

const auditRows = (layer: string) =>
  db
    .selectFrom('audit_log')
    .innerJoin('layers', 'layers.id', 'audit_log.layer_id')
    .select(['audit_log.kind', 'audit_log.idempotency_key', 'audit_log.undo_of'])
    .where('layers.doc_id', '=', DOC)
    .where('layers.name', '=', layer)
    .orderBy('audit_log.id')
    .execute();

const outcomeOf = (layer: string, opId: string) =>
  db
    .selectFrom('change_outcomes')
    .innerJoin('layers', 'layers.id', 'change_outcomes.layer_id')
    .selectAll('change_outcomes')
    .where('layers.doc_id', '=', DOC)
    .where('layers.name', '=', layer)
    .where('change_outcomes.op_id', '=', opId)
    .executeTakeFirst();

describe('a request of changes', () => {
  test('each change applies on its own: answers in order, a refused change rolls back alone', async () => {
    const layer = 'own';
    const answered = await post(layer, [
      { opId: 'a', ops: [create(20), create(80)] },
      {
        opId: 'b',
        ops: [
          create(140),
          { type: 'annotations.update', ref: missing, patch: { color: '#e11d48' } },
        ],
      },
      { opId: 'c', ops: [create(200)] },
    ]);
    expect(answered.status).toBe(200);
    const [a, b, c] = answered.body.changes;
    expect(a).toMatchObject({ opId: 'a', status: 'applied' });
    expect(a.result.items.map((item: { type: string }) => item.type)).toEqual([
      'annotations.create',
      'annotations.create',
    ]);
    expect(a.result.meta).toMatchObject({ opId: 'a', undoable: true });
    expect(a.result.meta.cacheDelta).toBeTruthy();
    expect(b).toMatchObject({ opId: 'b', status: 'refused', error: { code: 'NotFound' } });
    expect(c).toMatchObject({ opId: 'c', status: 'applied' });

    // The refused change's create rolled back with it.
    expect(await lefts(layer)).toEqual([20, 80, 200]);
    expect(await auditRows(layer)).toEqual([
      { kind: 'change', idempotency_key: 'a', undo_of: null },
      { kind: 'change', idempotency_key: 'c', undo_of: null },
    ]);
  });

  test('a change asked again gets its answer, refusals included; a different change under its opId is refused', async () => {
    const layer = 'retry';
    const changes = [
      { opId: 'r1', ops: [create(20)] },
      { opId: 'r2', ops: [{ type: 'annotations.delete', ref: missing }] },
    ];
    const first = await post(layer, changes);
    expect(first.status).toBe(200);
    expect(first.body.changes[1]).toMatchObject({ status: 'refused', error: { code: 'NotFound' } });

    const retry = await post(layer, changes);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(await lefts(layer)).toEqual([20]);
    expect(await auditRows(layer)).toHaveLength(1);

    // One answered, one new: the new one runs.
    const mixed = await post(layer, [changes[0], { opId: 'r3', ops: [create(80)] }]);
    expect(mixed.body.changes[0]).toEqual(first.body.changes[0]);
    expect(mixed.body.changes[1]).toMatchObject({ opId: 'r3', status: 'applied' });
    expect(await lefts(layer)).toEqual([20, 80]);

    const reused = await post(layer, [{ opId: 'r1', ops: [create(140)] }]);
    expect(reused.body.changes[0]).toMatchObject({
      opId: 'r1',
      status: 'refused',
      error: { code: 'IdempotencyKeyReused' },
    });
    const twice = await post(layer, [
      { opId: 'r4', ops: [create(140)] },
      { opId: 'r4', ops: [create(200)] },
    ]);
    expect(twice.body.changes[1]).toMatchObject({
      status: 'refused',
      error: { code: 'InvalidArg' },
    });
    expect(await lefts(layer)).toEqual([20, 80, 140]);
  });
});

describe('undo by reference', () => {
  test('in the same request, in a later one, and redo as the undo of the undo', async () => {
    const layer = 'undo';
    const same = await post(layer, [
      { opId: 'u1', ops: [create(20)] },
      { opId: 'u2', undoOf: 'u1' },
    ]);
    expect(same.body.changes.map((answer: { status: string }) => answer.status)).toEqual([
      'applied',
      'applied',
    ]);
    expect(await lefts(layer)).toEqual([]);

    const created = await post(layer, [{ opId: 'v1', ops: [create(80)] }]);
    const square = created.body.changes[0].result.items[0].annotation;
    await post(layer, [
      {
        opId: 'v2',
        ops: [{ type: 'annotations.update', ref: square.ref, patch: { color: '#e11d48' } }],
      },
    ]);
    expect((await annotationOf(layer, square.ref.objectNumber)).color).toBe('#e11d48');

    const undone = await post(layer, [{ opId: 'v3', undoOf: 'v2' }]);
    expect(undone.body.changes[0]).toMatchObject({ status: 'applied' });
    expect((await annotationOf(layer, square.ref.objectNumber)).color).toBe(square.color);

    const redone = await post(layer, [{ opId: 'v4', undoOf: 'v3' }]);
    expect(redone.body.changes[0]).toMatchObject({ status: 'applied' });
    expect((await annotationOf(layer, square.ref.objectNumber)).color).toBe('#e11d48');

    // Out of order: the square changed since it was made, so its create's
    // undo leaves it alone.
    const outOfOrder = await post(layer, [{ opId: 'v5', undoOf: 'v1' }]);
    expect(outOfOrder.body.changes[0].result.items).toEqual([
      expect.objectContaining({ type: 'skipped', op: 'annotations.delete' }),
    ]);
    expect(await lefts(layer)).toEqual([80]);

    // In order, it goes.
    await post(layer, [
      { opId: 'v6', undoOf: 'v4' },
      { opId: 'v7', undoOf: 'v1' },
    ]);
    expect(await lefts(layer)).toEqual([]);
    expect((await auditRows(layer)).map((row) => row.undo_of)).toEqual([
      null,
      'u1',
      null,
      null,
      'v2',
      'v3',
      'v4',
      'v1',
    ]);
  });

  test('only the user who made a change may undo it', async () => {
    const layer = 'whose';
    await post(layer, [{ opId: 'w1', ops: [create(20)] }], { sub: 'alice' });
    const bob = await post(layer, [{ opId: 'w2', undoOf: 'w1' }], { sub: 'bob' });
    expect(bob.body.changes[0]).toMatchObject({
      status: 'refused',
      error: { code: 'Forbidden' },
    });
    expect(await lefts(layer)).toEqual([20]);
    const alice = await post(layer, [{ opId: 'w3', undoOf: 'w1' }], { sub: 'alice' });
    expect(alice.body.changes[0]).toMatchObject({ status: 'applied' });
    expect(await lefts(layer)).toEqual([]);
  });

  test('an undo of a refused change leaves everything alone', async () => {
    const layer = 'undo-refused';
    await post(layer, [{ opId: 'x1', ops: [{ type: 'annotations.delete', ref: missing }] }]);
    const undone = await post(layer, [{ opId: 'x2', undoOf: 'x1' }]);
    expect(undone.body.changes[0]).toMatchObject({ status: 'applied', result: { items: [] } });
    expect(await auditRows(layer)).toEqual([]);
  });

  test('a final change ends undo for the changes before it; the sweeper drops their captures', async () => {
    const layer = 'final';
    await post(layer, [{ opId: 'f1', ops: [create(20)] }]);
    expect((await outcomeOf(layer, 'f1'))?.reverse).not.toBeNull();

    const flattened = await call('POST', '/pages/flatten', {
      layer,
      body: { pages: [page], usage: 'display' },
    });
    expect(flattened.status).toBe(200);
    await post(layer, [{ opId: 'f2', ops: [create(80)] }]);

    const refused = await post(layer, [{ opId: 'f3', undoOf: 'f1' }]);
    expect(refused.body.changes[0]).toMatchObject({
      status: 'refused',
      error: { code: 'UndoUnavailable', details: { reason: 'final-change' } },
    });

    expect(await bundle.layerService!.sweepChanges()).toBeGreaterThan(0);
    expect(await outcomeOf(layer, 'f1')).toMatchObject({ reverse: null, capture_key: null });
    // The answer stays for retries; the change after the final one still undoes.
    expect((await post(layer, [{ opId: 'f1', ops: [create(20)] }])).body.changes[0]).toMatchObject({
      status: 'applied',
    });
    const after = await post(layer, [{ opId: 'f4', undoOf: 'f2' }]);
    expect(after.body.changes[0]).toMatchObject({ status: 'applied' });
    expect(await lefts(layer)).toEqual([]);
  });

  test('answers past their retention go, and with them undo', async () => {
    const layer = 'expired';
    await post(layer, [{ opId: 'e1', ops: [create(20)] }]);
    expect(await bundle.layerService!.sweepChanges(Date.now() + 31 * DAY)).toBeGreaterThan(0);
    expect(await outcomeOf(layer, 'e1')).toBeUndefined();
    const refused = await post(layer, [{ opId: 'e2', undoOf: 'e1' }]);
    expect(refused.body.changes[0]).toMatchObject({
      status: 'refused',
      error: { code: 'UndoUnavailable', details: { reason: 'expired' } },
    });
  });
});

describe('the request', () => {
  test("a stamp's drawing travels as a multipart part, named by its key", async () => {
    const layer = 'multipart';
    const stamp = {
      type: 'annotations.create',
      page,
      data: { subtype: 'stamp', box: { x: 100, y: 212, width: 160, height: 80 }, fit: 'contain' },
      resources: { appearance: 'drawing' },
    };
    const form = new FormData();
    form.append('body', JSON.stringify({ changes: [{ opId: 'm1', ops: [stamp] }] }));
    form.append('resource:drawing', new Blob([tinyPng()], { type: 'image/png' }), 'stamp.png');
    const answered = await call('POST', '/changes', { layer, form });
    expect(answered.status).toBe(200);
    expect(answered.body.changes[0]).toMatchObject({ status: 'applied' });
    expect(answered.body.changes[0].result.items[0].annotation.subtype).toBe('stamp');

    const undone = await post(layer, [{ opId: 'm2', undoOf: 'm1' }]);
    expect(undone.body.changes[0]).toMatchObject({ status: 'applied' });

    // A key with no part refuses the request.
    const without = await post(layer, [{ opId: 'm3', ops: [stamp] }]);
    expect(without.status).toBe(400);
    expect(without.body.error.code).toBe('InvalidArg');
  });

  test('the limits refuse the whole request', async () => {
    const layer = 'limits';
    const many = Array.from({ length: 65 }, (_, i) => ({ opId: `l${i}`, ops: [create(20)] }));
    expect((await post(layer, many)).status).toBe(400);
    const big = await post(layer, [
      { opId: 'big', ops: Array.from({ length: 513 }, () => create(20)) },
    ]);
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PayloadTooLarge');
    expect(await lefts(layer)).toEqual([]);
  });

  test('a single-op route is one change: its audit kind stays, and it undoes by its Idempotency-Key', async () => {
    const layer = 'single';
    const created = await call('POST', `/annotations/pages/obj:${PAGE}/items`, {
      layer,
      body: create(20).data,
      headers: { 'Idempotency-Key': 'single-1' },
    });
    expect(created.status).toBe(200);
    expect(created.body.annotation.box.x).toBeCloseTo(20);
    expect(await auditRows(layer)).toEqual([
      { kind: 'annot.create', idempotency_key: 'single-1', undo_of: null },
    ]);

    const undone = await post(layer, [{ opId: 'single-2', undoOf: 'single-1' }]);
    expect(undone.body.changes[0]).toMatchObject({ status: 'applied' });
    expect(await lefts(layer)).toEqual([]);
  });
});

/** A 1×1 PNG. */
function tinyPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
}
