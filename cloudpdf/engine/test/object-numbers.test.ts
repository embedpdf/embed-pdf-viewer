import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  OBJECT_NUMBER_FIXTURE_PDF,
  runObjectNumberConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * Names at birth on the cloud engine: the shared conformance suite, against
 * a real server and engine. Every open is a fresh copy of the fixture, so
 * each test's numbers start from the same document.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-object-numbers-tenant';
let fx: DbSeededFixture | undefined;
let fixtureDir: string;
let fixturePath: string;
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-object-numbers-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'cloud-object-numbers-'));
  fixturePath = join(fixtureDir, 'object-numbers.pdf');
  await writeFile(fixturePath, OBJECT_NUMBER_FIXTURE_PDF);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  await rm(fixtureDir, { recursive: true, force: true });
});

runObjectNumberConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl });
  },
  open: async (engine) => {
    if (!fx) throw new Error('fixture not initialised');
    const docId = `object-numbers-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, docId, fixturePath, 2);
    return engine.open({ kind: 'token', token: docScopedToken(fx, TENANT_ID, docId) });
  },
});

/** A fetch that records each request and can delay or drop it. */
function instrumentedFetch(
  opts: {
    /** One-way delay, before and after the server. */
    delayMs?: number;
    /** Throw a network error instead of returning this request's answer (it reached the server). */
    dropAnswer?: (url: string, init: RequestInit) => boolean;
  } = {},
) {
  const requests: Array<{ method: string; url: string; headers: Headers }> = [];
  let writesInFlight = 0;
  let mostWritesInFlight = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const write = method !== 'GET' && !/\/(access|object-numbers)$/.test(new URL(url).pathname);
    requests.push({ method, url, headers: new Headers(init.headers) });
    if (write) mostWritesInFlight = Math.max(mostWritesInFlight, ++writesInFlight);
    try {
      if (opts.delayMs) await sleep(opts.delayMs);
      const response = await globalThis.fetch(input, init);
      if (opts.delayMs) await sleep(opts.delayMs);
      if (opts.dropAnswer?.(url, init)) {
        await response.arrayBuffer();
        throw new TypeError('fetch failed');
      }
      return response;
    } finally {
      if (write) writesInFlight--;
    }
  }) as typeof globalThis.fetch;
  return { fetch, requests, mostWritesInFlight: () => mostWritesInFlight };
}

describe('object numbers on the cloud', () => {
  const box = (x: number) => ({ x, y: 120, width: 20, height: 20 });

  async function openFresh(fetch: typeof globalThis.fetch, scope: ReadonlyArray<string> = ['*']) {
    if (!fx) throw new Error('fixture not initialised');
    const docId = `object-numbers-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, docId, fixturePath, 2);
    const engine = cloudEngine({ baseUrl: fx.baseUrl, fetch });
    const doc = await engine.open({
      kind: 'token',
      token: docScopedToken(fx, TENANT_ID, docId, scope),
    });
    const { pages } = await doc.pages.list();
    return { engine, doc, docId, page: pages[1]!.ref };
  }

  test("an editor's open brings its first numbers; a viewer's asks for none", async () => {
    const editor = instrumentedFetch();
    const opened = await openFresh(editor.fetch);
    expect(opened.doc.objectNumbers.held).toBe(8);
    await opened.engine.destroy();

    const viewer = instrumentedFetch();
    const read = await openFresh(viewer.fetch, ['doc.open']);
    expect(read.doc.objectNumbers.held).toBe(0);
    expect(viewer.requests.some((r) => r.url.endsWith('/access'))).toBe(false);
    // Reads don't name the editing session.
    expect(viewer.requests.every((r) => !r.headers.has('x-engine-session-id'))).toBe(true);
    await read.engine.destroy();
  });

  test('writes fired without waiting go out one at a time and land in order at their numbers', async () => {
    const slow = instrumentedFetch({ delayMs: 150 });
    const { engine, doc, page } = await openFresh(slow.fetch);
    await doc.objectNumbers.reserve(10);
    const numbers = Array.from({ length: 10 }, () => doc.objectNumbers.take()!);
    const events: number[] = [];
    doc.events.on('annotations.created', (event) => {
      if (event.annotation.ref.kind === 'objectNumber')
        events.push(event.annotation.ref.objectNumber);
    });
    // Each create's name is known before the server answers.
    const creates = numbers.map((objectNumber, i) =>
      doc
        .page(page)
        .annotations.create({ subtype: 'square', box: box(10 + i * 25) }, { objectNumber }),
    );
    const created = await Promise.all(creates);
    expect(created.map((c) => c.annotation.ref)).toEqual(
      numbers.map((objectNumber) => ({ kind: 'objectNumber', page, objectNumber })),
    );
    expect(events).toEqual(numbers);
    expect(slow.mostWritesInFlight()).toBe(1);
    const writes = slow.requests.filter(
      (r) => r.method === 'POST' && r.url.includes('/annotations/'),
    );
    expect(writes.map((r) => new URL(r.url).searchParams.get('objectNumber'))).toEqual(
      numbers.map(String),
    );
    await engine.destroy();
  });

  test('a create whose answer is lost on the network is sent again and lands once', async () => {
    let dropped = 0;
    const lossy = instrumentedFetch({
      dropAnswer: (url, init) =>
        init.method === 'POST' && url.includes('/annotations/') && dropped++ === 0,
    });
    const { engine, doc, page, docId } = await openFresh(lossy.fetch);
    const objectNumber = doc.objectNumbers.take()!;
    const created = await doc
      .page(page)
      .annotations.create({ subtype: 'square', box: box(20) }, { objectNumber, opId: 'paste-1' });
    expect(created.annotation.ref).toEqual({ kind: 'objectNumber', page, objectNumber });
    const sent = lossy.requests.filter(
      (r) => r.method === 'POST' && r.url.includes('/annotations/'),
    );
    expect(sent.map((r) => r.headers.get('idempotency-key'))).toEqual(['paste-1', 'paste-1']);
    const { annotations } = await doc.page(page).annotations.list();
    expect(
      annotations.filter(
        (a) => a.ref.kind === 'objectNumber' && a.ref.objectNumber === objectNumber,
      ),
    ).toHaveLength(1);
    const rows = await fx!.db
      .selectFrom('audit_log')
      .select('id')
      .where('doc_id', '=', docId)
      .where('idempotency_key', '=', 'paste-1')
      .execute();
    expect(rows).toHaveLength(1);
    await engine.destroy();
  });

  test('the event stream tells the pool which numbers the server took back', async () => {
    const { engine, doc, docId } = await openFresh(instrumentedFetch().fetch);
    const before = Array.from({ length: doc.objectNumbers.held }, () => doc.objectNumbers.take()!);
    expect(before).toHaveLength(8);
    // Another session took this one's block (its session had expired).
    const layer = await fx!.db
      .selectFrom('layers')
      .select('id')
      .where('doc_id', '=', docId)
      .executeTakeFirstOrThrow();
    await fx!.db
      .updateTable('object_number_blocks')
      .set({ session_id: 'cloud:other' })
      .where('layer_id', '=', layer.id)
      .execute();
    const lost = new Promise<{ numbers: readonly number[]; reason: string }>((resolve) =>
      doc.objectNumbers.onLost(resolve),
    );
    // The stream connects; its `session` event lists what the session holds.
    const unsubscribe = doc.events.subscribe(() => undefined);
    expect(await lost).toEqual({ numbers: before, reason: 'reclaimed' });
    // Holding none, the session was handed fresh numbers with the event.
    await expect.poll(() => doc.objectNumbers.held).toBe(8);
    const fresh = doc.objectNumbers.take()!;
    expect(before).not.toContain(fresh);
    unsubscribe();
    await engine.destroy();
  });
});
