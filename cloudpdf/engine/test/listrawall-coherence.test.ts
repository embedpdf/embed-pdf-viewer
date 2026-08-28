import { describe, expect, test } from 'vitest';
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';
import { HttpClient } from '../src/transport/HttpClient';
import { CloudDocumentHandle } from '../src/document/CloudDocumentHandle';

/**
 * listRawAll coherence against a stubbed multi-page server:
 *
 *   - ONE bulk read of the immutable `annotations/items@annotationsVersion`
 *     leaf at the manifest's pin, with the body-stamped `auditHead`;
 *   - a stale pin (concurrent mutation → 404) refreshes the manifest and
 *     retries the fresh leaf; an absorbed cacheDelta re-pins without any
 *     manifest refetch;
 *   - `listRaw(pon)` reads the versioned per-page leaf with the standard
 *     refresh-on-404 ladder;
 *   - the SSE `full-refresh` frame surfaces as a `stream.desynced` event.
 */

const DOC_ID = 'doc-listrawall-stub';
const LAYER_NAME = 'default';
const PAGE_OBJECT_NUMBERS = [11, 12, 13, 14, 15, 16, 17, 18];

interface StubState {
  docVersion: number;
  auditHead: number;
  /** One annotationVersion per page, keyed by pageObjectNumber. */
  annotationVersions: Map<number, number>;
  /** Doc-level bulk pin. */
  annotationsVersion: number;
}

interface Stub {
  http: HttpClient;
  state: StubState;
  calls: string[];
  /** Push one raw SSE block (without the trailing blank line) to every
   *  open events stream. */
  pushSse(block: string): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function annotation(pon: number, index: number) {
  return {
    subtype: 'unsupported',
    ref: { kind: 'objectNumber', pageObjectNumber: pon, annotObjectNumber: pon * 1000 + index },
    pageObjectNumber: pon,
    index,
    identityQuality: 'durable',
    nm: `stub-${pon}-${index}`,
    flags: {
      invisible: false,
      hidden: false,
      print: true,
      noZoom: false,
      noRotate: false,
      noView: false,
      readOnly: false,
      locked: false,
      toggleNoView: false,
      lockedContents: false,
    },
    rect: { left: 0, top: 0, right: 10, bottom: 10 },
    contents: null,
    subject: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    inReplyTo: null,
    replyType: null,
    rawSubtypeCode: 0,
    rawSubtypeName: null,
  };
}

function pageState(pon: number) {
  return {
    pageObjectNumber: pon,
    revision: { docSessionId: 'stub-session', pageObjectNumber: pon, generation: 0 },
    weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: false },
  };
}

function headPayload(docVersion: number) {
  return {
    id: DOC_ID,
    baseSha: 'stub-sha',
    storageSizeBytes: 1024,
    docVersion,
    state: 'ready',
    encryption: { state: 'none', requiresPassword: false },
    permissions: {
      known: true,
      bits: 0xffffffff,
      allAllowed: true,
      openedAs: 'none',
      securityHandlerRevision: null,
      canUpgradeToOwner: false,
    },
    access: { required: false, reasons: [] },
  };
}

function buildStub(overrides: Partial<StubState> = {}): Stub {
  const state: StubState = {
    docVersion: 1,
    auditHead: 40,
    annotationVersions: new Map(PAGE_OBJECT_NUMBERS.map((pon) => [pon, 1])),
    annotationsVersion: 1,
    ...overrides,
  };
  const calls: string[] = [];
  const sseControllers = new Set<ReadableStreamDefaultController<Uint8Array>>();

  const stub: Stub = {
    http: undefined as unknown as HttpClient,
    state,
    calls,
    pushSse(block) {
      const bytes = new TextEncoder().encode(`${block}\n\n`);
      for (const controller of sseControllers) controller.enqueue(bytes);
    },
  };

  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const notFound = (message: string) => json({ error: { code: 'NotFound', message } }, 404);

  const stubFetch: typeof globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
    calls.push(path);

    if (path === `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`) {
      return json(headPayload(state.docVersion));
    }

    const manifestMatch = path.match(/\/manifest@docVersion=(\d+)$/);
    if (manifestMatch) {
      if (Number(manifestMatch[1]) !== state.docVersion) return notFound('stale docVersion');
      return json({
        docVersion: state.docVersion,
        layoutVersion: 1,
        metadataVersion: 1,
        annotationsVersion: state.annotationsVersion,
        auditHead: state.auditHead,
        baseSha: 'stub-sha',
        pages: PAGE_OBJECT_NUMBERS.map((pon) => ({
          state: pageState(pon),
          cache: { contentVersion: 1, annotationVersion: state.annotationVersions.get(pon)! },
        })),
      });
    }

    const bulkMatch = path.match(/\/annotations\/items@annotationsVersion=(\d+)$/);
    if (bulkMatch) {
      if (Number(bulkMatch[1]) !== state.annotationsVersion) {
        return notFound('stale annotationsVersion');
      }
      return json({
        pages: PAGE_OBJECT_NUMBERS.map((pon) => ({
          pageState: pageState(pon),
          annotations: [annotation(pon, 0)],
        })),
        auditHead: state.auditHead,
      });
    }

    const leafMatch = path.match(/\/annotations\/pages\/(\d+)\/items@annotationVersion=(\d+)$/);
    if (leafMatch) {
      const pon = Number(leafMatch[1]);
      const version = Number(leafMatch[2]);
      if (!state.annotationVersions.has(pon)) return notFound('unknown page');
      if (version !== state.annotationVersions.get(pon)) return notFound('stale annotationVersion');
      return json({
        pageState: pageState(pon),
        annotations: [annotation(pon, 0)],
      });
    }

    if (path === `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/events`) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          sseControllers.add(controller);
          controller.enqueue(new TextEncoder().encode(':ok\n\n'));
        },
        cancel() {
          // Reader gone (doc closed) — nothing to clean beyond the set.
        },
      });
      void init;
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    return notFound(`unhandled stub path ${path}`);
  };

  stub.http = new HttpClient({ baseUrl: 'http://stub', token: 'stub-token', fetch: stubFetch });
  return stub;
}

const waitFor = async (predicate: () => boolean, what: string, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
};

describe('listRawAll — one bulk read at the manifest pin', () => {
  test('one bulk request serves the whole document; auditHead rides the body', async () => {
    const fx = buildStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const snap = await doc.annotations.listRawAll();

      expect(snap.pages).toHaveLength(PAGE_OBJECT_NUMBERS.length);
      expect(snap.auditHead).toBe(40);
      expect(new Set(snap.pages.map((p) => p.pageState.pageObjectNumber))).toEqual(
        new Set(PAGE_OBJECT_NUMBERS),
      );
      // Exactly ONE items request — the versioned bulk leaf; the per-page
      // leaves are never touched.
      const itemCalls = fx.calls.filter((p) => p.includes('/items'));
      expect(itemCalls).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/items@annotationsVersion=1`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('a stale bulk pin refreshes the manifest and retries the fresh leaf', async () => {
    const fx = buildStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      await doc.annotations.listRawAll(); // warms the manifest cache at pin 1

      // The server moves on: an annotation mutation bumps the bulk pin.
      fx.state.docVersion += 1;
      fx.state.annotationsVersion = 2;
      fx.state.auditHead = 50;

      const before = fx.calls.length;
      const snap = await doc.annotations.listRawAll();
      expect(snap.auditHead).toBe(50);
      const tail = fx.calls.slice(before).filter((p) => p.includes('/items'));
      expect(tail).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/items@annotationsVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/items@annotationsVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('an absorbed cacheDelta re-pins the bulk leaf without a manifest refetch', async () => {
    const fx = buildStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      await doc.annotations.listRawAll(); // manifest cached at pin 1

      // A mutation result rides in with the new pins (the absorb path).
      fx.state.docVersion = 2;
      fx.state.annotationsVersion = 2;
      fx.state.auditHead = 50;
      doc.absorbMutation(
        {
          affectedPages: [],
          cacheDelta: { previousDocVersion: 1, docVersion: 2, annotationsVersion: 2, pages: [] },
        },
        ['annotations'],
      );

      const before = fx.calls.length;
      const snap = await doc.annotations.listRawAll();
      expect(snap.auditHead).toBe(50);
      const tail = fx.calls.slice(before);
      expect(tail).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/items@annotationsVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });
});

describe('listRaw — versioned single-page reads', () => {
  test('reads the versioned leaf with the refresh-on-404 ladder', async () => {
    const fx = buildStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const first = await doc.annotations.listRaw(11);
      expect(first.annotations).toHaveLength(1);
      expect(fx.calls.filter((p) => p.includes('/items'))).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/11/items@annotationVersion=1`,
      ]);

      // Server moves on; the cached manifest pin goes stale → one 404,
      // one manifest refresh, one fresh versioned read.
      fx.state.docVersion += 1;
      fx.state.annotationVersions.set(11, 2);
      const before = fx.calls.length;
      const second = await doc.annotations.listRaw(11);
      expect(second.annotations).toHaveLength(1);
      const tail = fx.calls.slice(before).filter((p) => p.includes('/items'));
      expect(tail).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/11/items@annotationVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/11/items@annotationVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });
});

describe('stream.desynced — the SSE full-refresh surfaces to subscribers', () => {
  test('a full-refresh frame publishes exactly one stream.desynced event', async () => {
    const fx = buildStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const events: DocumentEvent[] = [];
      doc.events.subscribe((e) => events.push(e));
      await waitFor(
        () => fx.calls.some((p) => p.endsWith('/events')),
        'the SSE stream to open',
      );

      fx.pushSse('event: full-refresh');
      await waitFor(() => events.length > 0, 'the desync event');

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'stream.desynced', reason: 'backlog-overflow' });
      expect(typeof (events[0] as { ts: number }).ts).toBe('number');
    } finally {
      await doc.close();
    }
  });
});
