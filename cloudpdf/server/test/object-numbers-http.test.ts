/**
 * Object numbers over HTTP, on the native engine: the editing session
 * `/access` opens, creates at the numbers it was handed, the write top-up,
 * the bulk reservation, the event stream's `session` event, idempotent
 * retries, and the ceiling. The races between replicas are in
 * _helpers/object-numbers-replica-suite.ts.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  objectNumbersIn,
  parseObjectNumberRanges,
  type ObjectNumberRange,
} from '@embedpdf/engine-core/runtime';
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

const SECRET = 'object-numbers-http-secret';
const TENANT = 'tenant-numbers-http';
const DOC = 'doc-numbers-http';
/** The fixture's pages and its merged field. */
const FIRST_PAGE = 3;
const SECOND_PAGE = 4;
const MERGED_FIELD = 5;

let dir: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'object-numbers-http-'));
  const storageRoot = join(dir, 'objects');
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
  /** The layer the token is pinned to and the path names. */
  layer: string;
  /** X-Engine-Session-Id. */
  session?: string;
  sub?: string;
  scope?: string[];
  body?: unknown;
  headers?: Record<string, string>;
}

interface Answer {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

function tokenFor(opts: CallOptions): string {
  return signDevToken(SECRET, {
    sub: opts.sub ?? 'user-1',
    tenant_id: TENANT,
    doc_id: DOC,
    layer_name: opts.layer,
    scope: opts.scope ?? ['*'],
  });
}

async function call(method: string, path: string, opts: CallOptions): Promise<Answer> {
  const res = await fetch(`${baseUrl}/v1/docs/${DOC}/layers/${opts.layer}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFor(opts)}`,
      ...(opts.session ? { 'X-Engine-Session-Id': opts.session } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

const access = (opts: CallOptions) => call('POST', '/access', { ...opts, body: opts.body ?? {} });

const square = (x: number) => ({
  subtype: 'square',
  box: { x, y: 120, width: 40, height: 30 },
});

const createSquare = (page: number, objectNumber: number | null, opts: CallOptions) =>
  call(
    'POST',
    `/annotations/pages/obj:${page}/items${objectNumber !== null ? `?objectNumber=${objectNumber}` : ''}`,
    { ...opts, body: opts.body ?? square(20) },
  );

const count = (ranges: readonly ObjectNumberRange[]) =>
  ranges.reduce((sum, range) => sum + range.count, 0);

const notHeld = (answer: Answer, objectNumber: number) => {
  expect(answer.status).toBe(409);
  expect(answer.body.error).toMatchObject({
    code: 'ObjectNumberUnavailable',
    details: { objectNumber, reason: 'not-held' },
  });
};

describe('/access', () => {
  test('opens an editing session for a caller that may create, and hands it numbers', async () => {
    const layer = 'access';
    const opened = await access({ layer, session: 'cloud:s1' });
    expect(opened.status).toBe(200);
    expect(opened.body.edit).toMatchObject({ session: 'new', expiresIn: 900 });
    const first = objectNumbersIn(opened.body.edit.objectNumbers);
    expect(first).toHaveLength(8);
    // Past every object the document has.
    expect(Math.min(...first)).toBeGreaterThan(MERGED_FIELD);

    const again = await access({ layer, session: 'cloud:s1', body: { objectNumbers: 0 } });
    expect(again.body.edit).toMatchObject({ session: 'live', objectNumbers: [] });
    const more = await access({ layer, session: 'cloud:s1', body: { objectNumbers: 4 } });
    const second = objectNumbersIn(more.body.edit.objectNumbers);
    expect(second).toHaveLength(4);
    expect(second.some((number) => first.includes(number))).toBe(false);
  });

  test('a viewer, or a caller naming no session, gets no editing session', async () => {
    const layer = 'access-viewer';
    const viewer = await access({ layer, session: 'cloud:viewer', scope: ['doc.open'] });
    expect(viewer.status).toBe(200);
    expect(viewer.body.edit).toBeUndefined();
    const anonymous = await access({ layer });
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.edit).toBeUndefined();
  });

  test("a session id is its subject's", async () => {
    const layer = 'access-subject';
    await access({ layer, session: 'cloud:mine', sub: 'alice' });
    const taken = await access({ layer, session: 'cloud:mine', sub: 'bob' });
    expect(taken.status).toBe(403);
  });
});

describe('creates at numbers', () => {
  test('an annotation lands at the number named; the write tops the session up', async () => {
    const layer = 'creates';
    const session = 'cloud:creates';
    const handed = objectNumbersIn((await access({ layer, session })).body.edit.objectNumbers);
    const [first, second] = handed;

    const created = await createSquare(SECOND_PAGE, first!, {
      layer,
      session,
      headers: { 'EmbedPDF-Reserve-Object-Numbers': '4' },
    });
    expect(created.status).toBe(200);
    expect(created.body.annotation.ref).toEqual({
      kind: 'objectNumber',
      page: { kind: 'objectNumber', objectNumber: SECOND_PAGE },
      objectNumber: first,
    });
    const topUp = objectNumbersIn(
      parseObjectNumberRanges(created.headers.get('embedpdf-object-numbers')),
    );
    expect(topUp).toHaveLength(4);
    expect(topUp.some((number) => handed.includes(number))).toBe(false);

    // Spent.
    notHeld(await createSquare(SECOND_PAGE, first!, { layer, session }), first!);
    // A number from the top-up is held.
    const fromTopUp = await createSquare(SECOND_PAGE, topUp[0]!, { layer, session });
    expect(fromTopUp.status).toBe(200);
    expect(fromTopUp.body.annotation.ref.objectNumber).toBe(topUp[0]);
    // Another session's number, and a number without a session.
    const others = objectNumbersIn(
      (await access({ layer, session: 'cloud:other' })).body.edit.objectNumbers,
    );
    notHeld(await createSquare(SECOND_PAGE, others[0]!, { layer, session }), others[0]!);
    notHeld(await createSquare(SECOND_PAGE, second!, { layer }), second!);
    // A create naming nothing still works.
    expect((await createSquare(SECOND_PAGE, null, { layer, session })).status).toBe(200);
  });

  test('pages, fields and widgets are made at the numbers named', async () => {
    const layer = 'pages-forms';
    const session = 'cloud:pages-forms';
    const handed = objectNumbersIn(
      (await access({ layer, session, body: { objectNumbers: 8 } })).body.edit.objectNumbers,
    );
    const [page, field, left, right, widget, split] = handed;

    const inserted = await call('POST', `/pages/insert-blank?objectNumbers=${page}`, {
      layer,
      session,
      body: { size: { width: 200, height: 200 } },
    });
    expect(inserted.status).toBe(200);
    expect(inserted.body.insertedPages).toEqual([{ kind: 'objectNumber', objectNumber: page }]);

    const created = await call(
      'POST',
      `/form/fields?objectNumber=${field}&widgetObjectNumbers=${left},${right}`,
      {
        layer,
        session,
        body: {
          family: 'text',
          name: 'billing.name',
          widgets: [
            { page: { kind: 'objectNumber', objectNumber: page }, rect: square(20).box },
            { page: { kind: 'objectNumber', objectNumber: SECOND_PAGE }, rect: square(80).box },
          ],
        },
      },
    );
    expect(created.status).toBe(200);
    expect(created.body.field.ref).toEqual({ kind: 'objectNumber', objectNumber: field });
    expect(created.body.field.widgets.map((w: { objectNumber: number }) => w.objectNumber)).toEqual(
      [left, right],
    );

    const added = await call(
      'POST',
      `/form/fields/obj:${MERGED_FIELD}/widgets?objectNumber=${widget}&splitObjectNumber=${split}`,
      {
        layer,
        session,
        body: {
          page: { kind: 'objectNumber', objectNumber: FIRST_PAGE },
          rect: square(140).box,
        },
      },
    );
    expect(added.status).toBe(200);
    expect(
      added.body.field.widgets.map((w: { objectNumber: number }) => w.objectNumber).sort(),
    ).toEqual([split, widget].sort());
  });
});

describe('idempotent writes', () => {
  test('a retry under the same Idempotency-Key gets what the first committed, and no numbers', async () => {
    const layer = 'idempotent';
    const session = 'cloud:idempotent';
    const [number] = objectNumbersIn((await access({ layer, session })).body.edit.objectNumbers);
    const request = {
      layer,
      session,
      headers: { 'Idempotency-Key': 'create-once', 'EmbedPDF-Reserve-Object-Numbers': '4' },
    };

    const first = await createSquare(SECOND_PAGE, number!, request);
    expect(first.status).toBe(200);
    expect(first.headers.get('embedpdf-object-numbers')).not.toBeNull();
    const retry = await createSquare(SECOND_PAGE, number!, request);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers.get('embedpdf-object-numbers')).toBeNull();

    const rows = await db
      .selectFrom('audit_log')
      .select('id')
      .where('idempotency_key', '=', 'create-once')
      .execute();
    expect(rows).toHaveLength(1);
    const listed = await call('GET', `/annotations/pages/obj:${SECOND_PAGE}/items`, { layer });
    expect(
      listed.body.annotations.filter(
        (a: { ref: { objectNumber: number } }) => a.ref.objectNumber === number,
      ),
    ).toHaveLength(1);
  });

  test('every kind of write answers a retry with what it committed', async () => {
    const layer = 'idempotent-routes';
    const created = await createSquare(SECOND_PAGE, null, { layer });
    const item = `/annotations/pages/obj:${SECOND_PAGE}/items/obj:${created.body.annotation.ref.objectNumber}`;
    const writes: Array<[string, string, unknown]> = [
      ['POST', '/pages/insert-blank', { size: { width: 200, height: 200 } }],
      [
        'POST',
        '/pages/rotate',
        { pages: [{ kind: 'objectNumber', objectNumber: FIRST_PAGE }], rotation: 90 },
      ],
      ['POST', '/metadata', { title: 'Once' }],
      [
        'POST',
        '/form/fields',
        {
          family: 'text',
          name: 'once',
          widgets: [
            { page: { kind: 'objectNumber', objectNumber: SECOND_PAGE }, rect: square(80).box },
          ],
        },
      ],
      ['PATCH', item, { patch: { subtype: 'square', contents: 'once' } }],
      // A delete's retry gets the delete, not NotFound.
      ['DELETE', item, undefined],
    ];
    for (const [i, [method, path, body]] of writes.entries()) {
      const opts = { layer, body, headers: { 'Idempotency-Key': `write-${i}` } };
      const first = await call(method, path, opts);
      expect(first.status, `${method} ${path}`).toBe(200);
      const retry = await call(method, path, opts);
      expect(retry.status, `${method} ${path}`).toBe(200);
      expect(retry.body, `${method} ${path}`).toEqual(first.body);
    }
    const rows = await db
      .selectFrom('audit_log')
      .select('idempotency_key')
      .where('layer_name', '=', layer)
      .where('idempotency_key', 'is not', null)
      .execute();
    expect(rows.map((row) => row.idempotency_key).sort()).toEqual(
      writes.map((_, i) => `write-${i}`).sort(),
    );
  });

  test('a key a header cannot carry is refused', async () => {
    const answer = await createSquare(SECOND_PAGE, null, {
      layer: 'idempotent-bad',
      headers: { 'Idempotency-Key': 'has space' },
    });
    expect(answer.status).toBe(400);
  });
});

describe('the bulk reservation', () => {
  test('hands an editing session the count asked for, to callers that may create', async () => {
    const layer = 'bulk';
    const session = 'cloud:bulk';
    const reserved = await call('POST', '/object-numbers', {
      layer,
      session,
      body: { count: 100 },
    });
    expect(reserved.status).toBe(200);
    expect(count(reserved.body.objectNumbers)).toBeGreaterThanOrEqual(100);
    expect(reserved.body.expiresIn).toBe(900);
    const [number] = objectNumbersIn(reserved.body.objectNumbers);
    expect((await createSquare(SECOND_PAGE, number!, { layer, session })).status).toBe(200);

    for (const body of [{ count: 0 }, { count: 1001 }, {}]) {
      expect((await call('POST', '/object-numbers', { layer, session, body })).status).toBe(400);
    }
    expect((await call('POST', '/object-numbers', { layer, body: { count: 10 } })).status).toBe(
      400,
    );
    const viewer = await call('POST', '/object-numbers', {
      layer,
      session: 'cloud:bulk-viewer',
      scope: ['doc.open'],
      body: { count: 10 },
    });
    expect(viewer.status).toBe(403);
  });
});

describe('the event stream', () => {
  test("tells an editing session what it holds; a viewer's stream says nothing", async () => {
    const layer = 'stream';
    const session = 'cloud:stream';
    const handed = (await access({ layer, session })).body.edit.objectNumbers;

    const events = await readEvents(layer, session, (event) => event.event === 'session');
    const sessionEvent = events.find((event) => event.event === 'session');
    expect(sessionEvent).toBeDefined();
    const data = JSON.parse(sessionEvent!.data);
    expect(data.held).toEqual(handed);
    expect(data.expiresIn).toBeGreaterThan(890);
    expect(sessionEvent!.id).toBeUndefined();

    const quiet = await readEvents(layer, 'cloud:stream-viewer', () => false, 500);
    expect(quiet.some((event) => event.event === 'session')).toBe(false);
  });
});

describe('the ceiling', () => {
  test('a write that could pass it, or a reservation short of numbers, is LayerFull', async () => {
    const layer = 'ceiling';
    const session = 'cloud:ceiling';
    await access({ layer, session });
    const row = await db
      .selectFrom('layers')
      .select('id')
      .where('doc_id', '=', DOC)
      .where('name', '=', layer)
      .executeTakeFirstOrThrow();

    await db
      .updateTable('layers')
      .set({ next_object_number: 8_388_600 })
      .where('id', '=', row.id)
      .execute();
    const write = await createSquare(SECOND_PAGE, null, { layer, session });
    expect(write.status).toBe(409);
    expect(write.body.error.code).toBe('LayerFull');

    await db
      .updateTable('layers')
      .set({ next_object_number: 7_999_996 })
      .where('id', '=', row.id)
      .execute();
    const reserved = await call('POST', '/object-numbers', { layer, session, body: { count: 10 } });
    expect(reserved.status).toBe(409);
    expect(reserved.body.error.code).toBe('LayerFull');
  });
});

interface StreamEvent {
  event: string;
  data: string;
  id?: string;
}

/** Read the layer's event stream as `session` until `done` says so, or for `ms`. */
async function readEvents(
  layer: string,
  session: string,
  done: (event: StreamEvent) => boolean,
  ms = 5_000,
): Promise<StreamEvent[]> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  const events: StreamEvent[] = [];
  try {
    const res = await fetch(`${baseUrl}/v1/docs/${DOC}/layers/${layer}/events`, {
      headers: {
        Authorization: `Bearer ${tokenFor({ layer, sub: 'user-1' })}`,
        'X-Engine-Session-Id': session,
      },
      signal: abort.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done: ended, value } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true });
      for (let sep = buffer.indexOf('\n\n'); sep >= 0; sep = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (block.startsWith(':')) continue;
        const event: StreamEvent = { event: 'message', data: '' };
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event.event = line.slice(6).trim();
          else if (line.startsWith('data:')) event.data += line.slice(5).trim();
          else if (line.startsWith('id:')) event.id = line.slice(3).trim();
        }
        events.push(event);
        if (done(event)) return events;
      }
    }
  } catch (err) {
    if (!abort.signal.aborted) throw err;
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
  return events;
}
