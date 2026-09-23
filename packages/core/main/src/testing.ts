/**
 * @embedpdf/core/testing — a real plugin context for plugin unit tests, so a
 * suite never re-invents the kernel: the kernel's own store, state cell,
 * mirrors and event hooks, page geometry from a page list, capabilities from
 * a token map, cleanups you can run, and a document handle you shape per
 * test. Everything a controller reaches for behaves as in the kernel, minus
 * the engine.
 *
 *   const ctx = createTestContext({
 *     id: 'measurement',
 *     state: initialMeasurementState(),
 *     pages: [{ ref: toPageRef(1), size: { width: 600, height: 800 } }],
 *     capabilities: [[AnnotationToken, fakeAnnotation]],
 *     doc: { security: { allows: () => true } },
 *   });
 *   const api = ctx.connect(createMeasurementController(ctx));
 *   ctx.emitDocumentEvent(event); // folds into the plugin's mirrors
 */
import type {
  DocumentEvent,
  DocumentHandle,
  Engine,
  PageLayout,
  PageRef,
} from '@embedpdf/engine-core/runtime';
import { pageRefsEqual } from '@embedpdf/engine-core/runtime';
import { pageSpace, type PageSpace, type PdfEdges } from '@embedpdf/core-geometry';

import { PluginError } from './errors';
import { createEventHook } from './event-hook';
import { createLatestLane, type LatestLane } from './lanes';
import { createMirror, type MirrorController, type MirrorEnvironment } from './mirror';
import { createPageMirror } from './page-mirror';
import { createSerialQueue } from './serial-queue';
import { createStore } from './store';
import {
  DocumentsToken,
  type CapabilityToken,
  type DocInfo,
  type DocumentMeta,
  type DocumentsCapability,
  type OperationOptions,
  type PageInfo,
  type PluginContext,
  type Unsubscribe,
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

export interface TestContextOptions<S> {
  /** The plugin id (`ctx.id`, error prefixes). Default `'test'`. */
  readonly id?: string;
  /** The instance's initial state; omit for a stateless plugin. */
  readonly state?: S;
  /** The document's pages; `document()` and `geometry` derive from them. */
  readonly pages?: readonly TestPage[];
  readonly documentId?: string;
  /** Capabilities `get`/`tryGet` resolve, by token. `DocumentsToken` defaults to a
   *  registry holding this one document. */
  readonly capabilities?: ReadonlyArray<readonly [CapabilityToken<unknown>, unknown]>;
  /** The document handle members the test exercises (`security`, `page`, `events`, …),
   *  or a real engine document; `null` for a workspace plugin with no document. */
  readonly doc?: Partial<DocumentHandle> | null;
  readonly engine?: Partial<Engine>;
}

export interface TestContext<S> extends PluginContext<S> {
  /** Every capability `get` can resolve — add or replace during a test. */
  readonly capabilities: Map<CapabilityToken<unknown>, unknown>;
  /** Observe the change stream: state updates and `notify` wake the listener. */
  subscribe(listener: () => void): Unsubscribe;
  /**
   * What the kernel does after `create`: run the instance's `connect`, then
   * start its mirrors' first loads. Returns the instance's api.
   */
  connect<C>(instance: { api: C; connect?: () => void }): C;
  /** Deliver a confirmed document event, as the engine would (the default `doc.events`). */
  emitDocumentEvent(event: DocumentEvent): void;
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

/** A read-only document registry holding the test's one document. */
function testDocuments(meta: DocumentMeta): DocumentsCapability {
  const info: DocInfo = { id: meta.id, status: 'ready', pageCount: meta.pageCount };
  const known = (id?: string) => id === undefined || id === meta.id;
  const pagesOf = (id?: string) => (known(id) ? meta.pages : []);
  const unsupported = (verb: string) => () => {
    throw new PluginError('unsupported', 'documents', `${verb} is not available in a test context`);
  };
  const never = () => () => {};
  return {
    getActiveId: () => meta.id,
    getActive: () => info,
    list: () => [info],
    get: (id) => (known(id) ? info : null),
    has: (id) => known(id),
    getCount: () => 1,
    getOrder: () => [meta.id],
    listPages: pagesOf,
    getPage: (ref, id) => pagesOf(id).find((page) => pageRefsEqual(page.ref, ref)) ?? null,
    getPageAt: (index, id) => pagesOf(id)[index] ?? null,
    getPageIndex: (ref, id) => pagesOf(id).findIndex((page) => pageRefsEqual(page.ref, ref)),
    getRevision: (id) => (known(id) ? meta.revision : -1),
    allows: () => true,
    open: unsupported('open'),
    retry: unsupported('retry'),
    rename: unsupported('rename'),
    openAll: unsupported('openAll'),
    unlock: unsupported('unlock'),
    close: unsupported('close'),
    closeAll: unsupported('closeAll'),
    setActive: unsupported('setActive'),
    setOrder: unsupported('setOrder'),
    move: unsupported('move'),
    swap: unsupported('swap'),
    save: unsupported('save'),
    saveLayer: unsupported('saveLayer'),
    onOpened: never,
    onOpenFailed: never,
    onLocked: never,
    onClosed: never,
    onActiveChanged: never,
    onPagesChanged: never,
  } as DocumentsCapability;
}

export function createTestContext<S = void>(options: TestContextOptions<S> = {}): TestContext<S> {
  const id = options.id ?? 'test';
  const documentId = options.documentId ?? 'doc';
  const report = (error: unknown) => console.error(`[${id}]`, error);
  const store = createStore(report);
  const instanceId = `${documentId}:${id}`;
  const lease = store.lease<S>(id, options.state as S, instanceId);
  const cleanups: Array<() => void | Promise<void>> = [];
  const lifetime = new AbortController();
  const pages = (options.pages ?? []).map(layoutOf);
  const capabilities = new Map<CapabilityToken<unknown>, unknown>(options.capabilities ?? []);
  const documentEvents = createEventHook<DocumentEvent>(report);
  // A plain object lists the members a test fakes, over working defaults; a
  // real engine document (a class instance) is used as it is.
  const isRealHandle =
    options.doc != null && Object.getPrototypeOf(options.doc) !== Object.prototype;
  const doc =
    options.doc === null
      ? null
      : isRealHandle
        ? (options.doc as DocumentHandle)
        : ({
            id: documentId,
            events: { subscribe: documentEvents.on, lastServerId: () => null },
            security: { allows: () => true },
            ...options.doc,
          } as unknown as DocumentHandle);
  const requireDoc = (): DocumentHandle => {
    if (!doc) throw new PluginError('not-ready', id, 'the test context has no document');
    return doc;
  };
  const mirrors: MirrorController<unknown>[] = [];
  const mirrorEnvironment = (): MirrorEnvironment => ({
    doc: requireDoc(),
    lifetime: lifetime.signal,
    cell(name, initial) {
      const cell = store.lease(`${id}/${name}`, initial, instanceId);
      lifetime.signal.addEventListener('abort', () => cell.revoke(), { once: true });
      return cell;
    },
    onDocumentEvent(listener) {
      cleanups.push(requireDoc().events.subscribe(listener));
    },
    report,
  });
  const meta: DocumentMeta = {
    id: documentId,
    instanceId,
    pageCount: pages.length,
    pages,
    revision: 1,
    renderPolicy: { kind: 'continuous' },
  };
  if (!capabilities.has(DocumentsToken as CapabilityToken<unknown>)) {
    capabilities.set(DocumentsToken as CapabilityToken<unknown>, testDocuments(meta));
  }
  const spaces = new Map<number, PageSpace>();
  const tryForPage = (ref: PageRef): PageSpace | null => {
    const page = pages.find((pageInfo) => pageRefsEqual(pageInfo.ref, ref));
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
    const capability = resolve(token);
    if (capability === null) {
      throw new PluginError('not-found', id, `no capability for ${token.name} in the test context`);
    }
    return capability;
  };
  const queues = new Map<string, <T>(operation: () => Promise<T>) => Promise<T>>();
  const lanes = new Map<string, LatestLane>();

  const context: TestContext<S> = {
    id,
    instanceId: meta.instanceId,
    engine: (options.engine ?? {}) as Engine,
    documentId,
    get doc() {
      return doc as DocumentHandle;
    },
    documentHandle: () => doc,
    subscribe: store.subscribe,
    state: {
      get: () => lease.read(),
      update: (transition, ...args) => {
        lease.write(transition(lease.read(), ...args));
      },
      onChange: lease.onChange,
    },
    notify: store.notify,
    watch: (select, handler, isEqual = Object.is) => {
      let previous = select();
      const off = store.subscribe(() => {
        const next = select();
        if (isEqual(previous, next)) return;
        const prior = previous;
        previous = next;
        handler(next, prior);
      });
      cleanups.push(off);
      return off;
    },
    mirror: (spec) => {
      const controller = createMirror(spec, mirrorEnvironment());
      mirrors.push(controller as MirrorController<unknown>);
      return controller.mirror;
    },
    pageMirror: (spec) => createPageMirror(spec, mirrorEnvironment()),
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
    getPage: (ref): PageInfo | null =>
      pages.find((pageInfo) => pageRefsEqual(pageInfo.ref, ref)) ?? null,
    capabilities,
    connect: (instance) => {
      instance.connect?.();
      for (const mirror of mirrors.splice(0)) mirror.start();
      return instance.api;
    },
    emitDocumentEvent: (event) => documentEvents.emit(event),
    dispose: async () => {
      lifetime.abort();
      for (const fn of cleanups.splice(0).reverse()) await fn();
    },
  };
  return context;
}
