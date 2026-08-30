import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCloudEngine } from '../src/index';
import { HttpClient } from '../src/transport/HttpClient';
import { CloudDocumentHandle } from '../src/document/CloudDocumentHandle';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import {
  AnnotationListPageSnapshotSchema,
  DocumentHeadSchema,
  DocumentManifestSchema,
  PageTextSnapshotSchema,
} from '@embedpdf/engine-core/wire';

/**
 * Stub the network so we can drive the manifest pointer's value
 * from the test and observe the SDK's transparent re-fetch + retry.
 *
 * The fixture wires four endpoints:
 *
 *   GET /v1/docs/:docId/head             → current head (`docVersion`)
 *   GET /v1/docs/:docId/manifest@docVersion=N     → current manifest, 404 if `D` ≠ current
 *   GET /v1/docs/:docId/text/pages/:pon/data@contentVersion=N → page text, 404 if `P` ≠ current page contentVersion
 *   (any other path)                     → 404 (so we'd notice spurious calls)
 *
 * The test rewrites the "current" version mid-flight to model a
 * mutation flipping the manifest under the SDK. The retry must:
 *   1. Issue GET with the *stale* `P` (from cached manifest)
 *   2. Receive 404
 *   3. Re-fetch `/head` and the new `/manifest@docVersion=N`
 *   4. Re-issue GET with the *fresh* `P`
 *   5. Return the parsed snapshot
 *
 * If anything escapes that ladder — e.g. the retry uses the same
 * stale URL twice — the request count diverges from the expected
 * `[stale-leaf, head, manifest, fresh-leaf]` sequence and the
 * test fails loudly.
 */
interface ServerState {
  docVersion: number;
  layoutVersion: number;
  metadataVersion: number;
  pageContentVersion: number;
  pageAnnotationVersion: number;
  annotationCount: number;
  text: string;
  title: string | null;
}

interface CallLog {
  method: string;
  path: string;
  /** The request body as handed to fetch (FormData for multipart mutations). */
  body?: BodyInit | null;
}

interface StubbedFixture {
  http: HttpClient;
  fetch: typeof globalThis.fetch;
  state: ServerState;
  /** Mutate state to simulate the server bumping versions. */
  bump(opts: Partial<ServerState>): void;
  /** Every request that hit the stub, in order. */
  calls: CallLog[];
}

const DOC_ID = 'doc-retry-stub';
const LAYER_NAME = 'default';
const PAGE_OBJECT_NUMBER = 5;

function docToken(): string {
  return [
    base64UrlJson({ alg: 'none', typ: 'JWT' }),
    base64UrlJson({ doc_id: DOC_ID, layer_name: LAYER_NAME, sub: 'stub-user' }),
    'sig',
  ].join('.');
}

function base64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function annotation(index: number) {
  return {
    subtype: 'unsupported',
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: PAGE_OBJECT_NUMBER,
      annotObjectNumber: 10_000 + index,
    },
    pageObjectNumber: PAGE_OBJECT_NUMBER,
    index,
    identityQuality: 'durable',
    nm: `stub-${index}`,
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

function pageState(generation = 0) {
  return {
    pageObjectNumber: PAGE_OBJECT_NUMBER,
    revision: {
      docSessionId: 'stub-session',
      pageObjectNumber: PAGE_OBJECT_NUMBER,
      generation,
    },
    weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: false },
  };
}

// PageListSnapshot served by the /layout@layoutVersion leaf — pure geometry
// for the single stub page (the harness only asserts page identity/order).
function layoutSnapshot() {
  const box = { left: 0, bottom: 0, right: 612, top: 792 };
  return {
    pageCount: 1,
    pages: [
      {
        index: 0,
        pageObjectNumber: PAGE_OBJECT_NUMBER,
        label: null,
        size: { width: 612, height: 792 },
        rotation: 0 as const,
        userUnit: 1,
        boxes: { media: { ...box }, crop: { ...box } },
      },
    ],
  };
}

// DocumentMetadata served by the /metadata@metadataVersion leaf.
function metadataSnapshot(title: string | null) {
  return {
    title,
    author: null,
    subject: null,
    keywords: null,
    producer: null,
    creator: null,
    created: null,
    modified: null,
    trapped: 'unknown' as const,
    custom: {},
  };
}

function headPayload(id: string, docVersion: number, baseSha = 'stub-sha') {
  return {
    id,
    baseSha,
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

function buildStub(initial: ServerState): StubbedFixture {
  const state: ServerState = { ...initial };
  const calls: CallLog[] = [];

  const stubFetch: typeof globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ?? null });

    const headMatch = path.match(/^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/head$/);
    if (headMatch && method === 'GET') {
      return new Response(JSON.stringify(headPayload(headMatch[1]!, state.docVersion)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const manifestMatch = path.match(
      /^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/manifest@docVersion=(\d+)$/,
    );
    if (manifestMatch && method === 'GET') {
      const requested = Number(manifestMatch[3]);
      if (requested !== state.docVersion) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'stale docVersion' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          docVersion: state.docVersion,
          layoutVersion: state.layoutVersion,
          metadataVersion: state.metadataVersion,
          auditHead: 0,
          baseSha: 'stub-sha',
          pages: [
            {
              state: pageState(),
              cache: {
                contentVersion: state.pageContentVersion,
                annotationVersion: state.pageAnnotationVersion,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const layoutMatch = path.match(
      /^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/layout@layoutVersion=(\d+)$/,
    );
    if (layoutMatch && method === 'GET') {
      const requested = Number(layoutMatch[3]);
      if (requested !== state.layoutVersion) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'stale layoutVersion' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(layoutSnapshot()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const metadataLeafMatch = path.match(
      /^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/metadata@metadataVersion=(\d+)$/,
    );
    if (metadataLeafMatch && method === 'GET') {
      const requested = Number(metadataLeafMatch[3]);
      if (requested !== state.metadataVersion) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'stale metadataVersion' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(metadataSnapshot(state.title)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const metadataUpdateMatch = path.match(/^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/metadata$/);
    if (metadataUpdateMatch && method === 'POST') {
      const previousDocVersion = state.docVersion;
      state.docVersion += 1;
      state.metadataVersion += 1;
      // Apply the patch's `title` field for read-back assertions (the only
      // field the stub tracks). Three-state: undefined leaves, null clears.
      const body = init?.body ? (JSON.parse(String(init.body)) as { title?: string | null }) : {};
      if ('title' in body) state.title = body.title ?? null;
      return new Response(
        JSON.stringify({
          metadata: metadataSnapshot(state.title),
          cache: {
            previousDocVersion,
            docVersion: state.docVersion,
            metadataVersion: state.metadataVersion,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const textMatch = path.match(
      /^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/text\/pages\/(\d+)\/data@contentVersion=(\d+)$/,
    );
    if (textMatch && method === 'GET') {
      const requestedPon = Number(textMatch[3]);
      const requestedVersion = Number(textMatch[4]);
      if (requestedPon !== PAGE_OBJECT_NUMBER) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'unknown page' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      if (requestedVersion !== state.pageContentVersion) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'stale contentVersion' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          pageState: pageState(),
          text: state.text,
          charCount: state.text.length,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const annotationsMatch = path.match(
      /^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/annotations\/pages\/(\d+)\/items@annotationVersion=(\d+)$/,
    );
    if (annotationsMatch && method === 'GET') {
      const requestedPon = Number(annotationsMatch[3]);
      const requestedVersion = Number(annotationsMatch[4]);
      if (requestedPon !== PAGE_OBJECT_NUMBER) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'unknown page' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      if (requestedVersion !== state.pageAnnotationVersion) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'stale annotationVersion' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          pageState: pageState(),
          annotations: Array.from({ length: state.annotationCount }, (_, index) =>
            annotation(index),
          ),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const annotationCreateMatch = path.match(
      /^\/v1\/docs\/([^/]+)\/layers\/([^/]+)\/annotations\/pages\/(\d+)\/items$/,
    );
    if (annotationCreateMatch && method === 'POST') {
      const requestedPon = Number(annotationCreateMatch[3]);
      if (requestedPon !== PAGE_OBJECT_NUMBER) {
        return new Response(
          JSON.stringify({ error: { code: 'NotFound', message: 'unknown page' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      const previousDocVersion = state.docVersion;
      state.docVersion += 1;
      state.pageAnnotationVersion += 1;
      const created = annotation(state.annotationCount);
      state.annotationCount += 1;
      return new Response(
        JSON.stringify({
          created,
          meta: {
            cacheDelta: {
              previousDocVersion,
              docVersion: state.docVersion,
              pages: [
                {
                  pageObjectNumber: PAGE_OBJECT_NUMBER,
                  cache: {
                    contentVersion: state.pageContentVersion,
                    annotationVersion: state.pageAnnotationVersion,
                  },
                },
              ],
            },
            affectedPages: [pageState()],
            changed: [{ kind: 'objectNumber', value: created.ref.annotObjectNumber }],
            weakRefsInvalidated: false,
            shouldRefetch: null,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: { code: 'NotFound', message: `unhandled stub path ${path}` } }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  };

  return {
    fetch: stubFetch,
    http: new HttpClient({
      baseUrl: 'http://stub',
      token: 'stub-token',
      fetch: stubFetch,
    }),
    state,
    bump(opts) {
      Object.assign(state, opts);
    },
    calls,
  };
}

describe('HttpClient.getJsonWithRefresh — transparent stale-version retry', () => {
  test('non-404 errors propagate without triggering refresh', async () => {
    let refreshCalls = 0;
    const stubFetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: 'Forbidden', message: 'nope' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    const http = new HttpClient({ baseUrl: 'http://stub', token: 'tok', fetch: stubFetch });
    const ctrl = new AbortController();
    await expect(
      http.getJsonWithRefresh(
        async () => '/v1/x',
        (raw) => raw,
        async () => {
          refreshCalls += 1;
        },
        ctrl.signal,
      ),
    ).rejects.toMatchObject({ code: EngineErrorCode.Forbidden });
    expect(refreshCalls).toBe(0);
  });

  test('happy path: no 404, no refresh, exactly one GET', async () => {
    let refreshCalls = 0;
    let getCount = 0;
    const stubFetch: typeof globalThis.fetch = async () => {
      getCount += 1;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const http = new HttpClient({ baseUrl: 'http://stub', token: 'tok', fetch: stubFetch });
    const ctrl = new AbortController();
    const out = await http.getJsonWithRefresh(
      async () => '/v1/x',
      (raw) => raw as { ok: boolean },
      async () => {
        refreshCalls += 1;
      },
      ctrl.signal,
    );
    expect(out.ok).toBe(true);
    expect(refreshCalls).toBe(0);
    expect(getCount).toBe(1);
  });

  test('hard-caps retry at 1: if the second GET also 404s, it surfaces', async () => {
    let refreshCalls = 0;
    let getCount = 0;
    const stubFetch: typeof globalThis.fetch = async () => {
      getCount += 1;
      return new Response(JSON.stringify({ error: { code: 'NotFound', message: 'still stale' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    };
    const http = new HttpClient({ baseUrl: 'http://stub', token: 'tok', fetch: stubFetch });
    const ctrl = new AbortController();
    await expect(
      http.getJsonWithRefresh(
        async () => '/v1/x',
        (raw) => raw,
        async () => {
          refreshCalls += 1;
        },
        ctrl.signal,
      ),
    ).rejects.toMatchObject({ code: EngineErrorCode.NotFound });
    expect(refreshCalls).toBe(1);
    expect(getCount).toBe(2);
  });
});

describe('CloudPageTextService — end-to-end transparent retry', () => {
  let fx: StubbedFixture;

  beforeEach(() => {
    fx = buildStub({
      docVersion: 1,
      layoutVersion: 1,
      metadataVersion: 1,
      pageContentVersion: 1,
      pageAnnotationVersion: 1,
      annotationCount: 0,
      text: 'initial',
      title: 'initial-title',
    });
  });

  test('first read with cold cache: fetches head + manifest + leaf', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      const snap = await page.text.read();
      expect(snap.text).toBe('initial');
      expect(PageTextSnapshotSchema.safeParse(snap).success).toBe(true);
      const paths = fx.calls.map((c) => c.path);
      expect(paths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=1`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('open token seeds the first manifest fetch so pages.list does not repeat /head', async () => {
    const engine = createCloudEngine({
      baseUrl: 'http://stub',
      fetch: fx.fetch,
    });
    const doc = await engine.open({ kind: 'token', token: docToken() });
    try {
      const list = await doc.pages.list();
      expect(list.pages.map((page) => page.pageObjectNumber)).toEqual([PAGE_OBJECT_NUMBER]);
      const paths = fx.calls.map((call) => call.path);
      // pages.list reads layoutVersion off the (seeded) manifest, then fetches
      // the content-addressed /layout leaf — no extra /head.
      expect(paths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/layout@layoutVersion=1`,
      ]);
      expect(paths.filter((path) => path.endsWith('/head'))).toHaveLength(1);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test('stale open seed falls back to /head before surfacing pages.list', async () => {
    const engine = createCloudEngine({
      baseUrl: 'http://stub',
      fetch: fx.fetch,
    });
    const doc = await engine.open({ kind: 'token', token: docToken() });
    try {
      fx.bump({ docVersion: 2, pageContentVersion: 2, pageAnnotationVersion: 2 });
      const list = await doc.pages.list();
      expect(list.pages.map((page) => page.pageObjectNumber)).toEqual([PAGE_OBJECT_NUMBER]);
      const paths = fx.calls.map((call) => call.path);
      // Stale seed → manifest ladder refreshes to v2 first, then the /layout
      // leaf is fetched at the refreshed layoutVersion.
      expect(paths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=2`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/layout@layoutVersion=1`,
      ]);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test('refreshManifest still re-fetches /head after the open seed is consumed', async () => {
    const engine = createCloudEngine({
      baseUrl: 'http://stub',
      fetch: fx.fetch,
    });
    const doc = await engine.open({ kind: 'token', token: docToken() });
    try {
      await doc.pages.list();
      fx.bump({ docVersion: 2, pageContentVersion: 2, pageAnnotationVersion: 2 });
      const callsBeforeRefresh = fx.calls.length;
      const page = doc.page(PAGE_OBJECT_NUMBER);
      const snap = await page.text.read();
      expect(snap.text).toBe('initial');
      const paths = fx.calls.slice(callsBeforeRefresh).map((call) => call.path);
      expect(paths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=2`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=2`,
      ]);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });

  test('warm cache: second read on the same page skips head + manifest', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      await page.text.read();
      const callsAfterFirst = fx.calls.length;
      await page.text.read();
      const newPaths = fx.calls.slice(callsAfterFirst).map((c) => c.path);
      expect(newPaths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=1`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('server flips manifest mid-flight: SDK transparently re-fetches and retries', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      // Warm the cache so the SDK has docVersion=1 / pageContentVersion=1
      // squirrelled away.
      const first = await page.text.read();
      expect(first.text).toBe('initial');

      // Server bumps both versions, as a mutation would.
      fx.bump({ docVersion: 2, pageContentVersion: 2, text: 'after-mutation' });

      const callsBeforeRetry = fx.calls.length;
      const second = await page.text.read();
      expect(second.text).toBe('after-mutation');

      // The retry ladder must be exactly:
      //   [stale-leaf v1]   → 404
      //   [/head]           → 200 (docVersion=2)
      //   [/manifest@docVersion=2]    → 200 (pageContentVersion=2)
      //   [fresh-leaf v2]   → 200
      const retryPaths = fx.calls.slice(callsBeforeRetry).map((c) => c.path);
      expect(retryPaths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=2`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=2`,
      ]);

      // Cache is now warm with v2; a third read uses the new version
      // and goes straight to the leaf URL — no second refresh.
      const callsBeforeThird = fx.calls.length;
      const third = await page.text.read();
      expect(third.text).toBe('after-mutation');
      const thirdPaths = fx.calls.slice(callsBeforeThird).map((c) => c.path);
      expect(thirdPaths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/text/pages/${PAGE_OBJECT_NUMBER}/data@contentVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('annotation list uses the same layer refresh-on-404 ladder', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      const first = await page.annotations.list();
      expect(first.annotations).toEqual([]);
      expect(AnnotationListPageSnapshotSchema.safeParse(first).success).toBe(true);

      fx.bump({ docVersion: 2, pageAnnotationVersion: 2 });

      const callsBeforeRetry = fx.calls.length;
      const second = await page.annotations.list();
      expect(second.annotations).toEqual([]);

      const retryPaths = fx.calls.slice(callsBeforeRetry).map((c) => c.path);
      expect(retryPaths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/${PAGE_OBJECT_NUMBER}/items@annotationVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=2`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/${PAGE_OBJECT_NUMBER}/items@annotationVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('metadata read uses the same layer refresh-on-404 ladder as text/annotations', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const first = await doc.metadata.read();
      expect(first.title).toBe('initial-title');

      // A metadata write bumps docVersion + metadataVersion under the SDK.
      fx.bump({ docVersion: 2, metadataVersion: 2, title: 'after-write' });

      const callsBeforeRetry = fx.calls.length;
      const second = await doc.metadata.read();
      expect(second.title).toBe('after-write');

      const retryPaths = fx.calls.slice(callsBeforeRetry).map((c) => c.path);
      expect(retryPaths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/metadata@metadataVersion=1`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=2`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/metadata@metadataVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('metadata update absorbs cache in place so the next read skips the 404 refresh', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const first = await doc.metadata.read();
      expect(first.title).toBe('initial-title');

      const result = await doc.metadata.update({ title: 'patched-title' });
      expect(result.metadata.title).toBe('patched-title');
      expect(result.cache).toEqual({
        previousDocVersion: 1,
        docVersion: 2,
        metadataVersion: 2,
      });

      // applyMetadata advanced the cached manifest in place: the next read
      // goes straight to the fresh /metadata leaf — no /head, no /manifest.
      const callsBeforeRead = fx.calls.length;
      const after = await doc.metadata.read();
      expect(after.title).toBe('patched-title');
      const paths = fx.calls.slice(callsBeforeRead).map((c) => c.path);
      expect(paths).toEqual([`/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/metadata@metadataVersion=2`]);
    } finally {
      await doc.close();
    }
  });

  test('mutation manifest delta moves the next annotation list to the fresh URL without 404 refresh', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      const first = await page.annotations.list();
      expect(first.annotations).toEqual([]);

      const created = await page.annotations.create({
        subtype: 'highlight',
        contents: 'delta-driven-create',
        quadPoints: [
          {
            p1: { x: 0, y: 0 },
            p2: { x: 10, y: 0 },
            p3: { x: 0, y: 10 },
            p4: { x: 10, y: 10 },
          },
        ],
      });
      expect(created.meta.cacheDelta?.previousDocVersion).toBe(1);
      expect(created.meta.cacheDelta?.docVersion).toBe(2);

      const callsBeforeList = fx.calls.length;
      const second = await page.annotations.list();
      expect(second.annotations).toHaveLength(1);
      const paths = fx.calls.slice(callsBeforeList).map((call) => call.path);
      expect(paths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/${PAGE_OBJECT_NUMBER}/items@annotationVersion=2`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('partial manifest delta with a skipped docVersion invalidates instead of manufacturing a mixed manifest', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      await page.annotations.list();

      doc.absorbMutation({
        affectedPages: [pageState()],
        cacheDelta: {
          previousDocVersion: 2,
          docVersion: 3,
          pages: [
            {
              pageObjectNumber: PAGE_OBJECT_NUMBER,
              cache: {
                contentVersion: 1,
                annotationVersion: 3,
              },
            },
          ],
        },
      });

      fx.bump({ docVersion: 3, pageAnnotationVersion: 3 });
      const callsBeforeList = fx.calls.length;
      await page.annotations.list();
      const paths = fx.calls.slice(callsBeforeList).map((call) => call.path);
      expect(paths).toEqual([
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/head`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/manifest@docVersion=3`,
        `/v1/docs/${DOC_ID}/layers/${LAYER_NAME}/annotations/pages/${PAGE_OBJECT_NUMBER}/items@annotationVersion=3`,
      ]);
    } finally {
      await doc.close();
    }
  });

  test('two concurrent first-reads share a single head+manifest round-trip (singleflight)', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const page = doc.page(PAGE_OBJECT_NUMBER);
      const [a, b] = await Promise.all([page.text.read(), page.text.read()]);
      expect(a.text).toBe('initial');
      expect(b.text).toBe('initial');
      const headCount = fx.calls.filter((c) => c.path.endsWith('/head')).length;
      const manifestCount = fx.calls.filter((c) => c.path.includes('/manifest@')).length;
      // Phase 4 contract: cold-cache fetches are singleflighted, so
      // even two parallel page reads trigger exactly one /head + one
      // /manifest. Without the inflight dedupe, this would be 2/2.
      expect(headCount).toBe(1);
      expect(manifestCount).toBe(1);
    } finally {
      await doc.close();
    }
  });

  test('read on a non-existent page surfaces NotFound without spuriously refreshing', async () => {
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      const ghost = doc.page(999_999);
      let caught: unknown;
      try {
        await ghost.text.read();
      } catch (err) {
        caught = err;
      }
      expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      const headCalls = fx.calls.filter((c) => c.path.endsWith('/head')).length;
      const manifestCalls = fx.calls.filter((c) => c.path.includes('/manifest@')).length;
      // The SDK fetches the manifest once to resolve the page; the
      // "page not in manifest" branch throws locally and does NOT
      // trigger the 404→refresh ladder (no leaf call, no refresh).
      expect(headCalls).toBe(1);
      expect(manifestCalls).toBe(1);
      const leafCalls = fx.calls.filter((c) => c.path.includes('/text')).length;
      expect(leafCalls).toBe(0);
    } finally {
      await doc.close();
    }
  });
});

describe('CloudEngine schema parity — DocumentHeadSchema / DocumentManifestSchema', () => {
  // Pure shape parity test; ensures the schemas the cloud SDK depends on
  // accept the exact payloads the stub fixture produces. If a Zod shape
  // drifts (e.g. someone adds a required field on the server) this test
  // catches it before the cloud SDK silently regresses.
  test('schemas accept the stub fixture payloads', () => {
    const head = DocumentHeadSchema.safeParse({
      ...headPayload(DOC_ID, 1, 'sha'),
      storageSizeBytes: 1,
    });
    expect(head.success).toBe(true);

    const manifest = DocumentManifestSchema.safeParse({
      docVersion: 1,
      layoutVersion: 1,
      metadataVersion: 1,
      auditHead: 0,
      baseSha: 'sha',
      pages: [
        {
          state: {
            pageObjectNumber: 5,
            revision: { docSessionId: 's', pageObjectNumber: 5, generation: 0 },
            weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: false },
          },
          cache: {
            contentVersion: 1,
            annotationVersion: 1,
          },
        },
      ],
    });
    expect(manifest.success).toBe(true);
  });
});

describe('CloudPageAnnotationsService — binary payload wire shape', () => {
  const freshStub = () =>
    buildStub({
      docVersion: 1,
      layoutVersion: 1,
      metadataVersion: 1,
      pageContentVersion: 1,
      pageAnnotationVersion: 1,
      annotationCount: 0,
      text: 'initial',
      title: 'initial-title',
    });

  /** Minimal valid PNG (8-byte signature is all the client-side sniff needs
   *  to pass... but ship a real one so dimensions parse too). */
  const TINY_PNG = (() => {
    // 1×1 RGBA PNG, bytes verified by the engine-core sniffer in this test.
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  })();

  test('a stamp create ships as multipart: `body` JSON part + `resource:{key}` file part', async () => {
    const fx = freshStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      await doc.page(PAGE_OBJECT_NUMBER).annotations.create({
        subtype: 'stamp',
        rect: { left: 10, bottom: 10, right: 110, top: 60 },
        source: TINY_PNG,
        fit: 'contain',
      });

      const post = fx.calls.find((c) => c.method === 'POST' && c.path.endsWith('/items'));
      expect(post).toBeDefined();
      expect(post!.body).toBeInstanceOf(FormData);
      const form = post!.body as FormData;

      const wire = JSON.parse(String(form.get('body')));
      expect(wire).toMatchObject({
        subtype: 'stamp',
        fit: 'contain',
        source: { resource: 'r0' },
      });
      expect(wire.source.resource).toBe('r0'); // never inline bytes on the wire

      const part = form.get('resource:r0');
      expect(part).toBeInstanceOf(Blob);
      expect((part as Blob).type).toBe('image/png'); // sniffed, not declared
      const bytes = new Uint8Array(await (part as Blob).arrayBuffer());
      expect(bytes).toEqual(TINY_PNG);
    } finally {
      await doc.close();
    }
  });

  test('drafts without binaries still POST plain JSON (no multipart envelope)', async () => {
    const fx = freshStub();
    const doc = new CloudDocumentHandle(fx.http, DOC_ID);
    try {
      await doc.page(PAGE_OBJECT_NUMBER).annotations.create({
        subtype: 'highlight',
        quadPoints: [
          {
            p1: { x: 0, y: 0 },
            p2: { x: 10, y: 0 },
            p3: { x: 0, y: 10 },
            p4: { x: 10, y: 10 },
          },
        ],
      });
      const post = fx.calls.find((c) => c.method === 'POST' && c.path.endsWith('/items'));
      expect(post).toBeDefined();
      expect(typeof post!.body).toBe('string');
      expect(JSON.parse(post!.body as string).subtype).toBe('highlight');
    } finally {
      await doc.close();
    }
  });
});

void createCloudEngine;
