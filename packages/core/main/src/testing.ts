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
 *
 * Time is the host's timers unless a test passes a clock: `manualClock()`
 * steps timers and frames by hand.
 *
 *   const time = manualClock();
 *   const ctx = createTestContext({ clock: time.clock });
 *   time.advance(300); // timers due by then run
 *   time.frame(16); // and the callbacks waiting for a frame
 */
import type {
  DocumentEvent,
  DocumentHandle,
  Engine,
  PageLayout,
  PageRef,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { pageRefsEqual, subscribeToType } from '@embedpdf/engine-core/runtime';

/** Brand a fake engine or handle as local (`[LOCAL_ENGINE_BRAND]: true`) so
 *  `isLocalEngine` and `isLocalDocument` accept it. */
export { LOCAL_ENGINE_BRAND } from '@embedpdf/engine-core/runtime';

import { instanceClock, timerClock, type Cancel, type HostClock } from './clock';
import { PluginError } from './errors';
import { createEventHook } from './event-hook';
import { createLatestLane, type LatestLane } from './lanes';
import { createMirror, type MirrorController, type MirrorEnvironment } from './mirror';
import { createPageMirror } from './page-mirror';
import { createSerialQueue, type SerialQueue } from './serial-queue';
import { cancellable } from './cancellable';
import { findPage, pageOf } from './page-of';
import { readWrapped, type DownloadWrap } from './context';
import { fieldPermissionDenied, permissionDenied, sessionAllows } from './permissions';
import { createSettingsStore, type NoSettings, type SettingsDeclaration } from './settings';
import { settle, type SettleFlush } from './settle';
import { createStore } from './store';
import {
  DocumentsToken,
  type CapabilityToken,
  type DocumentInfo,
  type DocumentMeta,
  type DocumentsCapability,
  type OperationOptions,
  type PluginContext,
  type Unsubscribe,
} from './types';

export interface TestPage {
  readonly ref: PageRef;
  /** Page size in points (default 612 × 792, or the crop's extent); the crop box is `[0, 0, w, h]` unless given. */
  readonly size?: { readonly width: number; readonly height: number };
  readonly crop?: PdfRect;
  readonly rotation?: PageLayout['rotation'];
  readonly userUnit?: number;
  readonly label?: string | null;
}

export interface TestContextOptions<S, T extends object = NoSettings> {
  /** The plugin id (`ctx.id`, error prefixes). Default `'test'`. */
  readonly id?: string;
  /** The instance's initial state; omit for a stateless plugin. */
  readonly state?: S;
  /**
   * The plugin's settings, as its definition declares them; `ctx.settings()` reads them.
   * Without them the context has none, and `ctx.settings()` throws.
   */
  readonly settings?: SettingsDeclaration<T>;
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
  /** The host's time (`ctx.clock`). Default: `timerClock`, the environment's timers and no frames. */
  readonly clock?: HostClock;
}

export interface TestContext<S, T extends object = NoSettings> extends PluginContext<S, T> {
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
  /** What `documents.download()` does first: run every `onSettle` flush and wait for it (settle.ts). */
  settle(signal?: AbortSignal): Promise<void>;
  /**
   * What `documents.download()` does after settling: `read` the file inside every
   * `aroundDownload` wrap, the first registered outermost.
   */
  download(read: () => Promise<Uint8Array>): Promise<Uint8Array>;
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
  // Every box is the crop box, measured from its own top-left corner.
  const visible = { x: 0, y: 0, width: crop.right - crop.left, height: crop.top - crop.bottom };
  return {
    index,
    ref: page.ref,
    label: page.label ?? null,
    size,
    rotation: page.rotation ?? 0,
    userUnit: page.userUnit ?? 1,
    boxes: {
      media: { ...visible },
      crop: { ...visible },
      bleed: { ...visible },
      trim: { ...visible },
      art: { ...visible },
    },
    pdfCropBox: crop,
  };
};

/** A read-only document registry holding the test's one document. */
function testDocuments(meta: DocumentMeta): DocumentsCapability {
  const info: DocumentInfo = {
    id: meta.id,
    status: 'ready',
    pageCount: meta.pageCount,
    hasUnsavedChanges: false,
  };
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
    getPage: (page, id) => findPage(pagesOf(id), page),
    getPageIndex: (ref, id) => pagesOf(id).findIndex((page) => pageRefsEqual(page.ref, ref)),
    getRevision: (id) => (known(id) ? meta.revision : -1),
    canDownload: () => true,
    canPrint: () => true,
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
    download: unsupported('download'),
    downloadLayer: unsupported('downloadLayer'),
    onOpened: never,
    onOpenFailed: never,
    onLocked: never,
    onClosed: never,
    onActiveChanged: never,
    onPagesChanged: never,
    onUnsavedChangesChanged: never,
  } satisfies DocumentsCapability;
}

export function createTestContext<S = void, T extends object = NoSettings>(
  options: TestContextOptions<S, T> = {},
): TestContext<S, T> {
  const id = options.id ?? 'test';
  const documentId = options.documentId ?? 'doc';
  const report = (error: unknown) => console.error(`[${id}]`, error);
  const store = createStore(report);
  const instanceId = `${documentId}:${id}`;
  const lease = store.lease<S>(id, options.state as S, instanceId);
  const cleanups: Array<() => void | Promise<void>> = [];
  const lifetime = new AbortController();
  const settleFlushes = new Set<SettleFlush>();
  const downloadWraps: DownloadWrap[] = [];
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
        : fakeDocument({
            id: documentId,
            events: {
              subscribe: documentEvents.on,
              on: (type: DocumentEvent['type'], listener: (event: DocumentEvent) => void) =>
                subscribeToType(documentEvents.on, type, listener),
              lastServerId: () => null,
            },
            security: { allows: () => true, allowsAnnotation: () => true, allowsField: () => true },
            ...options.doc,
          });
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
    hasUnsavedChanges: false,
  };
  if (!capabilities.has(DocumentsToken as CapabilityToken<unknown>)) {
    capabilities.set(DocumentsToken as CapabilityToken<unknown>, testDocuments(meta));
  }
  const notFound = (ref: PageRef) =>
    new PluginError('not-found', id, `page ${ref.objectNumber} is not in this document`);
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
  const queues = new Map<string, SerialQueue>();
  const lanes = new Map<string, LatestLane>();
  // The context is the plugin's only instance, so it holds the registration's settings itself.
  const settingsStore = options.settings
    ? createSettingsStore(options.settings, store.notify, report)
    : null;
  if (settingsStore) cleanups.push(() => settingsStore.dispose());
  const settings = settingsStore?.forInstance((teardown) => cleanups.push(teardown)) ?? null;

  const context: TestContext<S, T> = {
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
    settings: () => {
      if (!settings) throw new Error(`[${id}] the test context declares no settings`);
      return settings;
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
    clock: instanceClock(options.clock ?? timerClock, lifetime.signal),
    onSettle: (flush) => {
      settleFlushes.add(flush);
      cleanups.push(() => {
        settleFlushes.delete(flush);
      });
    },
    aroundDownload: (wrap) => {
      downloadWraps.push(wrap);
      cleanups.push(() => {
        const index = downloadWraps.indexOf(wrap);
        if (index >= 0) downloadWraps.splice(index, 1);
      });
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
        queue = createSerialQueue(id);
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
      if (!pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, ref))) throw notFound(ref);
    },
    getPage: (page) => findPage(pages, page),
    pageOf: (page) => pageOf(pages, page, id),
    allows: (permission) => sessionAllows(requireDoc().security, permission),
    assertAllowed: (permission, operation) => {
      if (!sessionAllows(requireDoc().security, permission)) {
        throw permissionDenied(id, permission, operation);
      }
    },
    allowsField: (action, field) =>
      requireDoc().security.allowsField(action, { groupId: field.groupId }),
    assertAllowedField: (action, field, operation) => {
      if (!requireDoc().security.allowsField(action, { groupId: field.groupId })) {
        throw fieldPermissionDenied(id, action, field, operation);
      }
    },
    cancellable: (signal, task) => cancellable(id, signal, task),
    capabilities,
    connect: (instance) => {
      instance.connect?.();
      for (const mirror of mirrors.splice(0)) mirror.start();
      return instance.api;
    },
    emitDocumentEvent: (event) => documentEvents.emit(event),
    settle: (signal) => settle(settleFlushes, [signal, lifetime.signal], report),
    download: (read) => readWrapped(downloadWraps, read),
    dispose: async () => {
      lifetime.abort();
      for (const fn of cleanups.splice(0).reverse()) await fn();
    },
  };
  return context;
}

/** A clock a test steps by hand (see {@link manualClock}). */
export interface ManualClock {
  /** The clock to hand a test context or a kernel. */
  readonly clock: HostClock;
  /** The current time in milliseconds. It starts at 0. */
  readonly now: number;
  /** How many timers and frame callbacks are waiting. */
  readonly pending: { readonly timers: number; readonly frames: number };
  /** Move time forward by `ms`, running the timers that fall due, earliest first. */
  advance(ms: number): void;
  /**
   * Show a frame at `timeMs` (default: now): move time there, running the
   * timers due by then, and run the callbacks waiting for a frame. What they
   * schedule waits for the next frame.
   */
  frame(timeMs?: number): void;
}

/**
 * Time that moves only when the test moves it. `frames: false` gives a host
 * that never paints, as Node is.
 */
export function manualClock(options: { frames?: boolean } = {}): ManualClock {
  let now = 0;
  let order = 0;
  const timers = new Map<number, { due: number; run: () => void }>();
  const frames = new Map<number, (timeMs: number) => void>();

  const nextDue = (until: number): number | undefined => {
    let found: number | undefined;
    for (const [id, timer] of timers) {
      if (timer.due > until) continue;
      if (found === undefined || timer.due < timers.get(found)!.due) found = id;
    }
    return found;
  };
  const advanceTo = (target: number): void => {
    if (target < now) throw new Error(`manualClock: time does not go back (${target} < ${now})`);
    for (let id = nextDue(target); id !== undefined; id = nextDue(target)) {
      const timer = timers.get(id)!;
      timers.delete(id);
      now = timer.due;
      timer.run();
    }
    now = target;
  };

  const clock: HostClock = {
    now: () => now,
    after(ms, run): Cancel {
      const id = ++order;
      timers.set(id, { due: now + Math.max(0, ms), run });
      return () => void timers.delete(id);
    },
    ...(options.frames === false
      ? {}
      : {
          nextFrame(run: (timeMs: number) => void): Cancel {
            const id = ++order;
            frames.set(id, run);
            return () => void frames.delete(id);
          },
        }),
  };
  return {
    clock,
    get now() {
      return now;
    },
    get pending() {
      return { timers: timers.size, frames: frames.size };
    },
    advance: (ms) => advanceTo(now + ms),
    frame(timeMs = now) {
      advanceTo(timeMs);
      const due = [...frames.values()];
      frames.clear();
      for (const run of due) run(now);
    },
  };
}

/**
 * A faked document's members over the defaults every document has: calls'
 * facts and working sets change no result, so `with` gives the same fake and
 * a working set goes nowhere, unless the test fakes them.
 */
function fakeDocument(members: Record<string, unknown>): DocumentHandle {
  const fake: Record<string, unknown> = { setWorkingSet: () => {}, ...members };
  fake.with ??= () => fake;
  return fake as unknown as DocumentHandle;
}
