/**
 * @embedpdf/core/testing — a real `ControllerContext` for plugin unit tests,
 * so a suite never re-invents the kernel: state + reducer + subscribers,
 * page geometry from a page list, capabilities from a token map, cleanups
 * you can run, and a document handle you shape per test. Everything a
 * controller reaches for exists here with the kernel's semantics, minus the
 * engine.
 *
 *   const ctx = createTestContext({
 *     id: 'measurement',
 *     initialState: initialMeasurementState(),
 *     reduce: measurementReducer,
 *     pages: [{ ref: toPageRef(1), size: { width: 600, height: 800 } }],
 *     capabilities: [[AnnotationToken, fakeAnnotation]],
 *     doc: { security: { allows: () => true } },
 *   });
 *   const api = createMeasurementController(ctx).api;
 */
import type { DocumentHandle, Engine, PageLayout, PageRef } from '@embedpdf/engine-core/runtime';
import { pageRefsEqual } from '@embedpdf/engine-core/runtime';
import { pageSpace, type PageSpace, type PdfEdges } from '@embedpdf/core-geometry';

import { PluginError } from './errors';
import { createEventHook } from './event-hook';
import { createLatestLane, type LatestLane } from './lanes';
import { createSerialQueue } from './serial-queue';
import type {
  Action,
  CapabilityToken,
  ControllerContext,
  CoreState,
  DocumentMeta,
  OperationOptions,
  PageInfo,
} from './types';

export interface TestPage {
  readonly ref: PageRef;
  /** Page size in points (default 612 × 792, or the crop's extent); the crop box is `[0, 0, w, h]` unless given. */
  readonly size?: { readonly width: number; readonly height: number };
  readonly crop?: PdfEdges;
  readonly rotation?: PageLayout['rotation'];
  readonly userUnit?: number;
  readonly label?: string | null;
}

export interface TestContextOptions<S, A extends Action> {
  /** The plugin id (`ctx.id`, error prefixes). Default `'test'`. */
  readonly id?: string;
  readonly initialState: S;
  readonly reduce?: (state: S, action: A) => S;
  /** The document's pages; `document()` and `geometry` derive from them. */
  readonly pages?: readonly TestPage[];
  readonly documentId?: string;
  /** Capabilities `get`/`tryGet` resolve, by token. */
  readonly capabilities?: ReadonlyArray<readonly [CapabilityToken<unknown>, unknown]>;
  /** The document handle members the test exercises (`security`, `page`, `events`, …);
   *  `null` for a workspace plugin with no document. */
  readonly doc?: Partial<DocumentHandle> | null;
  readonly engine?: Partial<Engine>;
}

export interface TestContext<S, A extends Action> extends ControllerContext<S, A> {
  /** Every capability `get` can resolve — add or replace during a test. */
  readonly capabilities: Map<CapabilityToken<unknown>, unknown>;
  /** Fire every subscriber without a dispatch (an external change). */
  notify(): void;
  /** Run the registered cleanups and abort the lifetime (the plugin's unmount). */
  dispose(): Promise<void>;
}

const layoutOf = (page: TestPage, index: number): PageLayout => {
  // Size follows the crop when only the crop is given, and vice versa.
  const size =
    page.size ??
    (page.crop
      ? { width: page.crop.right - page.crop.left, height: page.crop.top - page.crop.bottom }
      : { width: 612, height: 792 });
  const crop = page.crop ?? { left: 0, bottom: 0, right: size.width, top: size.height };
  return {
    index,
    ref: page.ref,
    label: page.label ?? null,
    size,
    rotation: page.rotation ?? 0,
    userUnit: page.userUnit ?? 1,
    boxes: { media: { ...crop }, crop: { ...crop } },
  };
};

export function createTestContext<S, A extends Action = Action>(
  options: TestContextOptions<S, A>,
): TestContext<S, A> {
  const id = options.id ?? 'test';
  const documentId = options.documentId ?? 'doc';
  const reduce = options.reduce ?? ((state: S) => state);
  let state = options.initialState;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const cleanups: Array<() => void | Promise<void>> = [];
  const lifetime = new AbortController();
  const pages = (options.pages ?? []).map(layoutOf);
  const capabilities = new Map<CapabilityToken<unknown>, unknown>(options.capabilities ?? []);
  const doc =
    options.doc === null
      ? null
      : ({
          id: documentId,
          events: { subscribe: () => () => {}, lastServerId: () => null },
          security: { allows: () => true },
          ...options.doc,
        } as unknown as DocumentHandle);
  const meta: DocumentMeta = {
    id: documentId,
    instanceId: `${documentId}:${id}`,
    pageCount: pages.length,
    pages,
    revision: 1,
    renderPolicy: { kind: 'continuous' },
  };
  const spaces = new Map<number, PageSpace>();
  const tryForPage = (ref: PageRef): PageSpace | null => {
    const page = pages.find((p) => pageRefsEqual(p.ref, ref));
    if (!page) return null;
    let space = spaces.get(ref.pageObjectNumber);
    if (!space) {
      space = pageSpace(page.boxes.crop);
      spaces.set(ref.pageObjectNumber, space);
    }
    return space;
  };
  const notFound = (ref: PageRef) =>
    new PluginError('not-found', id, `page ${ref.pageObjectNumber} is not in this document`);
  const resolve = <T>(token: CapabilityToken<T>): T | null =>
    capabilities.has(token as CapabilityToken<unknown>)
      ? (capabilities.get(token as CapabilityToken<unknown>) as T)
      : null;
  const require = <T>(token: CapabilityToken<T>): T => {
    const cap = resolve(token);
    if (cap === null) {
      throw new PluginError('not-found', id, `no capability for ${token.name} in the test context`);
    }
    return cap;
  };
  const queues = new Map<string, <T>(operation: () => Promise<T>) => Promise<T>>();
  const lanes = new Map<string, LatestLane>();

  const context: TestContext<S, A> = {
    id,
    instanceId: meta.instanceId,
    engine: (options.engine ?? {}) as Engine,
    documentId,
    get doc() {
      return doc as DocumentHandle;
    },
    documentHandle: () => doc,
    getState: () => state,
    dispatch: (action) => {
      state = reduce(state, action);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    core: () => ({ documents: { [documentId]: meta } }) as unknown as CoreState,
    document: () => meta,
    get: require,
    tryGet: resolve,
    forDocument: (token) => require(token),
    tryForDocument: (token) => resolve(token),
    cleanup: (fn) => {
      cleanups.push(fn);
    },
    events: {
      source: <T>() => {
        const hook = createEventHook<T>((error) =>
          console.error(`[${id}] listener failed:`, error),
        );
        cleanups.push(() => hook.dispose());
        return hook;
      },
    },
    geometry: {
      tryForPage,
      forPage: (ref) => {
        const space = tryForPage(ref);
        if (!space) throw notFound(ref);
        return space;
      },
    },
    listen: (source, listener) => {
      const off = typeof source === 'function' ? source(listener) : source.subscribe(listener);
      cleanups.push(off);
    },
    waitFor: (predicate, waitOptions?: OperationOptions) =>
      new Promise<void>((resolveWait, reject) => {
        if (predicate()) return resolveWait();
        const off = context.subscribe(() => {
          if (!predicate()) return;
          off();
          resolveWait();
        });
        waitOptions?.signal?.addEventListener('abort', () => {
          off();
          reject(new PluginError('operation-cancelled', id, 'waitFor cancelled'));
        });
      }),
    serialQueue: (key = 'default') => {
      let queue = queues.get(key);
      if (!queue) {
        queue = createSerialQueue();
        queues.set(key, queue);
      }
      return queue;
    },
    latest: (key) => {
      let lane = lanes.get(key);
      if (!lane) {
        lane = createLatestLane(lifetime.signal, id, key);
        lanes.set(key, lane);
      }
      return lane;
    },
    acquire: async (get, dispose) => {
      const resource = await get(lifetime.signal);
      if (lifetime.signal.aborted) {
        await dispose(resource);
        throw new PluginError('instance-closed', id, 'acquired after close');
      }
      cleanups.push(() => dispose(resource));
      return resource;
    },
    assertPageRef: (ref) => {
      if (!tryForPage(ref)) throw notFound(ref);
    },
    getPage: (ref): PageInfo | null => pages.find((p) => pageRefsEqual(p.ref, ref)) ?? null,
    capabilities,
    notify,
    dispose: async () => {
      lifetime.abort();
      for (const fn of cleanups.splice(0).reverse()) await fn();
    },
  };
  return context;
}
