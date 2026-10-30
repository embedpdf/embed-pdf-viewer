import { createBurstGate } from './bursts';
import { createDocumentChanges } from './changes';
import { timerClock, type HostClock } from './clock';
import { createStore } from './store';
import {
  createPluginContext,
  markConnected,
  runWrapped,
  sliceKey,
  type ContextServices,
  type SessionRef,
} from './context';
import type { SliceLease } from './store';
import { cancellable } from './cancellable';
import { createEventHook } from './event-hook';
import { PluginError, toPluginError, toPluginErrorInfo, type PluginErrorCode } from './errors';
import { findPage } from './page-of';
import { isPdf } from './pdf-header';
import { permissionDenied, sessionAllows } from './permissions';
import { settle } from './settle';
import {
  createSettingsStore,
  type DeepPartial,
  type SettingsApi,
  type SettingsOf,
  type SettingsStore,
} from './settings';
import { planPlugins } from './order';
import { createScope, CancelledError, isCancelled, type Scope } from './scope';
import {
  DocumentsToken,
  type AnyPlugin,
  type CapabilityToken,
  type CoreState,
  type DocumentHandle,
  type DocumentInfo,
  type DocumentMeta,
  type DocumentsCapability,
  type Engine,
  type GlobalState,
  type OpenDocumentOptions,
  type OpenDocumentResult,
  type OpenInput,
  type OpenSource,
  type DocumentOpenedEvent,
  type DocumentOpenFailedEvent,
  type DocumentLockedEvent,
  type DocumentClosedEvent,
  type DocumentActiveChangedEvent,
  type DocumentPagesChangedEvent,
  type DocumentUnsavedChangesChangedEvent,
  type HostFetch,
  type HostPrinter,
  type PageInfo,
  type PendingMeta,
  type Permission,
  type PreparedPrint,
  type PrintOptions,
  type PrintQuality,
  type PrintSheet,
  type StagedPrint,
  type PluginScope,
  type Unsubscribe,
  type UnlockOptions,
  type UrlSource,
  type RetryOptions,
  type ShareOpenRequest,
} from './types';
import { VIEWER_DEFAULTS, VIEWER_WHOLE_SETTINGS, type ViewerSettings } from './viewer-settings';
import {
  CONTINUOUS_RENDER_POLICY,
  isLocalDocument,
  pageRefsEqual,
  shareOpenRequestOf,
  visitorIdentityRequestOf,
  type OpenInputShare,
  type VisitorAnswers,
  type VisitorIdentityRequest,
  type DocumentEvent,
  type EngineRenderPolicy,
  type PageLayout,
  type PageRef,
  type PrintDpi,
} from '@embedpdf/engine-core/runtime';

const EMPTY_PAGES: readonly PageLayout[] = Object.freeze([]);

/** The new page registry a document mutation carries, or null for events that
 *  don't change page structure (annotations, metadata). The snapshot is the
 *  same shape `pages.list()` returns, so callers swap it in directly. */
function layoutFromEvent(event: DocumentEvent) {
  switch (event.type) {
    case 'pages.reordered':
    case 'pages.rotated':
    case 'pages.deleted':
    case 'pages.inserted':
    case 'pages.restored':
      return event.layout;
    default:
      return null;
  }
}

/** Kernel lifecycle. Monotonic: created → starting → started, then destroying →
 *  destroyed; `failed` is a terminal branch off starting. */
export type KernelStatus =
  | 'created'
  | 'starting'
  | 'started'
  | 'failed'
  | 'destroying'
  | 'destroyed';

/**
 * The viewer: the engine, the plugins and the open documents. Its own settings
 * (`getSettings()`, `updateSettings()`, …) are what every document gets unless it says
 * otherwise, and what every plugin's colors fall back to (`viewer-settings.ts`).
 */
export interface Kernel extends SettingsApi<ViewerSettings> {
  readonly engine: Engine;
  readonly documents: DocumentsCapability;
  /**
   * Resolve a capability. For document-scoped tokens, `documentId` defaults to the active doc.
   * For a workspace token, a `documentId` gives the capability as seen from that document's
   * scope (`PluginDef.inScope`; the documents capability too): the same object on every call
   * while the document is open.
   */
  capability<T>(token: CapabilityToken<T>, documentId?: string): T;
  /**
   * Total sibling of `capability()`: `null` instead of throwing — no
   * provider, no document, or a document that isn't `ready` yet. This is the
   * method adapters subscribe to (`useKernelValue`-style): resolution is a
   * value derived from kernel state, not a pure function of its arguments —
   * a pending document's promotion changes the result while the id stays the
   * same, so caching a `capability()` call by id goes stale. The returned
   * instance is reference-stable per (plugin, document), so equality-cached
   * reads don't churn.
   */
  tryCapability<T>(token: CapabilityToken<T>, documentId?: string): T | null;
  /** A token's scope — adapters use this to decide whether to bind a document. */
  scopeOf(token: CapabilityToken<unknown>): PluginScope;
  /**
   * A plugin's settings calls, with or without a document open: settings belong to the plugin
   * as the app registered it, not to a document. For adapters (a settings hook renders before
   * the first document opens) and for an app that changes them before opening one. Throws
   * when no installed plugin provides `token`, or its plugin declares no settings.
   */
  settingsOf<C>(token: CapabilityToken<C>): SettingsApi<SettingsOf<C>>;
  subscribe(listener: () => void): Unsubscribe;
  getState(): GlobalState;
  status(): KernelStatus;
  /** Idempotent: a second call joins the first. Throws after destroy(). */
  start(): Promise<void>;
  /**
   * Idempotent: every call returns the same promise. Joins an in-flight
   * start(), closes every document (their engine handles included), then
   * unwinds workspace resources. Never throws.
   */
  destroy(): Promise<void>;
}

const isDocumentScoped = (plugin: AnyPlugin) => plugin.scope === 'document';
const initialStateOf = (plugin: AnyPlugin): unknown => plugin.state?.();
/**
 * A document's public fields, one object per registry entry: the entries are replaced, never
 * changed, so the same entry gives the same object, and readers re-render only for their own.
 */
const infoByEntry = new WeakMap<DocumentMeta | PendingMeta, DocumentInfo>();
function documentInfoOf(entry: DocumentMeta | PendingMeta): DocumentInfo {
  let info = infoByEntry.get(entry);
  if (!info) {
    info = 'pages' in entry ? readyInfo(entry) : pendingInfo(entry);
    infoByEntry.set(entry, info);
  }
  return info;
}
const readyInfo = (meta: DocumentMeta): DocumentInfo =>
  Object.freeze({
    id: meta.id,
    name: meta.name,
    status: 'ready',
    pageCount: meta.pageCount,
    hasUnsavedChanges: meta.hasUnsavedChanges,
    ...(meta.identityRequest ? { identityRequest: meta.identityRequest } : {}),
    ...(meta.shareRequest ? { shareRequest: meta.shareRequest } : {}),
  });
const pendingInfo = (meta: PendingMeta): DocumentInfo =>
  Object.freeze({
    id: meta.id,
    name: meta.name,
    status: meta.status,
    pageCount: 0,
    hasUnsavedChanges: false,
    ...(meta.status === 'locked' ? { passwordProvided: meta.passwordProvided ?? false } : {}),
    ...(meta.status === 'error' && meta.error !== undefined
      ? { error: toPluginErrorInfo(toPluginError('documents', meta.error)) }
      : {}),
    ...(meta.shareRequest ? { shareRequest: meta.shareRequest } : {}),
  });

/**
 * What an open from a share link (`share`) that failed with `error` waits for: the link's
 * passphrase, or the visitor's answers. `share` says whether a passphrase was tried.
 */
function shareRequestOf(
  error: unknown,
  share: OpenInputShare | null,
): ShareOpenRequest | undefined {
  if (!share) return undefined;
  return shareOpenRequestOf(error, share.sharePassword !== undefined) ?? undefined;
}

/**
 * What `retry()` opens: the failed document's source, or, with the passphrase the visitor gave
 * (`RetryOptions`), the share link it opened with that passphrase.
 */
function retrySourceOf(
  source: OpenSource,
  share: OpenInputShare | null,
  options: RetryOptions | undefined,
): OpenSource {
  const { sharePassword, identity } = options ?? {};
  if (sharePassword === undefined && identity === undefined) return source;
  if (!share) {
    throw new PluginError(
      'invalid-input',
      'documents',
      'only a document from a share link takes its passphrase or answers',
    );
  }
  return sharePassword !== undefined ? { ...share, sharePassword } : share;
}

/** Whether an event is a change to the document, one a download would carry. */
const changesDocument = (event: DocumentEvent): boolean =>
  event.type !== 'stream.desynced' &&
  event.type !== 'document.versioned' &&
  event.type !== 'signatures.prepared' &&
  event.type !== 'signatures.cancelled';

/** What a download's HTTP status says: the file isn't there, the user may not have it, or neither. */
const downloadErrorCode = (status: number): PluginErrorCode =>
  status === 404
    ? 'not-found'
    : status === 401 || status === 403
      ? 'permission-denied'
      : 'operation-failed';

/**
 * Download a URL source's file with the host's `fetch`, or the global one; its tab shows why
 * when the server says no, or answers with something that isn't a PDF.
 */
async function fetchUrlSource(
  source: UrlSource,
  signal: AbortSignal,
  hostFetch: HostFetch | undefined,
): Promise<OpenInput> {
  // Called as a plain function: the browser's own `fetch` refuses any other `this`.
  const fetchFile = hostFetch ?? (globalThis as { fetch?: HostFetch }).fetch;
  if (!fetchFile) {
    throw new PluginError('unsupported', 'documents', `can't download ${source.url}: no fetch()`);
  }
  const response = await fetchFile(source.url, { signal });
  if (!response.ok) {
    throw new PluginError(
      downloadErrorCode(response.status),
      'documents',
      `couldn't download ${source.url} (HTTP ${response.status})`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Said here, where it's known: the engine says only that it couldn't open the file. A sign-in
  // page a server answers with instead is the usual one.
  if (!isPdf(bytes)) {
    throw new PluginError('invalid-input', 'documents', `${source.url} isn't a PDF`);
  }
  return { kind: 'bytes', ...(source.id !== undefined ? { id: source.id } : {}), bytes };
}

const isUrlSource = (source: OpenInput | UrlSource): source is UrlSource => source.kind === 'url';

const noLayer = () =>
  new PluginError('unsupported', 'documents', 'only the local engine gives a layer to download');

/** How a print comes out at each tier, one object each, so readers can compare them with `Object.is`. */
const PRINT_STANDARD: PrintQuality = Object.freeze({ kind: 'images', dpi: 150 });
const PRINT_HIGH: Extract<PrintQuality, { kind: 'images' }> = Object.freeze({
  kind: 'images',
  dpi: 300,
});
const PRINT_PDF: PrintQuality = Object.freeze({ kind: 'pdf' });

/** One print being staged: the document, its pages, what prints beside them, the job's name. */
interface PrintJob {
  readonly handle: DocumentHandle;
  readonly pages: readonly PageInfo[];
  readonly layers: { readonly includeAnnotations: boolean; readonly includeFormFields: boolean };
  readonly name: string;
  readonly options: PrintOptions;
}

/**
 * The documents capability as seen from inside one document's scope: every call whose document
 * is optional uses that document instead of the active one. The rest is the registry itself.
 */
const documentsInScope = (
  documents: DocumentsCapability,
  documentId: string,
): DocumentsCapability => ({
  ...documents,
  get: (id = documentId) => documents.get(id),
  download: (id = documentId, options) => documents.download(id, options),
  downloadLayer: (id = documentId, options) => documents.downloadLayer(id, options),
  canDownload: (id = documentId) => documents.canDownload(id),
  preparePrint: (id = documentId, options) => documents.preparePrint(id, options),
  print: (id = documentId, options) => documents.print(id, options),
  getPrintQuality: (id = documentId) => documents.getPrintQuality(id),
  canPrint: (id = documentId) => documents.canPrint(id),
  listPages: (id = documentId) => documents.listPages(id),
  getPage: (page, id = documentId) => documents.getPage(page, id),
  getPageIndex: (ref, id = documentId) => documents.getPageIndex(ref, id),
  getRevision: (id = documentId) => documents.getRevision(id),
});

/** The stable id an input implies, if it carries one ('bytes'/'layerBytes'/'id'). */
const idOfInput = (input: OpenInput | UrlSource): string | null =>
  'id' in input && typeof input.id === 'string' ? input.id : null;

/**
 * Everything one open document owns, in one place: the engine handle, the
 * resource scope (event subs, slices, plugin cleanups, the handle's own
 * close), the capability instances, and the in-flight lifecycle operation.
 * The session is the document's lifecycle; the store's `documents`/`pending`
 * entries are its UI projection.
 *
 *   opening — slot reserved; source resolving / engine opening
 *   locked  — parked on a password; the scope already owns handle.close
 *   bringup — post-security: slices, construction, connection; not yet published
 *   ready   — committed; the only phase adapters resolve capabilities in
 *   error   — open failed after the slot was reserved; resources disposed
 *   closing — close() won; unpublished, joining the operation, disposing
 */
interface DocumentSession extends SessionRef {
  name?: string;
  /** What `open()` was called with, so a failed tab can `retry()`. */
  source: OpenSource | null;
  /** The share link the source opened (`{ kind: 'share' }`), once a function source gave it. */
  shareInput: OpenInputShare | null;
  openOptions: OpenDocumentOptions | undefined;
  phase: 'opening' | 'locked' | 'bringup' | 'ready' | 'error' | 'closing';
  /** In-flight open/unlock — close() cancels, then joins this before disposing,
   *  so "close resolved" means "no producer is still acquiring resources". */
  operation: Promise<unknown> | null;
  /** The current engine call, retained so close() can abort real worker-side
   *  work instead of waiting for it to land at a checkpoint. */
  engineOp: { abort(reason?: unknown): void } | null;
  cancel: AbortController;
  capabilities: Map<AnyPlugin, unknown>;
  /**
   * The plugins whose `create()` is running. A read that reaches one of them meanwhile finds
   * no capability yet, instead of building it a second time. (Listeners can't cause one: the
   * store holds its notifications while a document's plugins are built.)
   */
  building: Set<AnyPlugin>;
  /** Workspace capabilities as seen from this document's scope (`PluginDef.inScope`), by token. */
  views: Map<CapabilityToken<unknown>, unknown>;
  /** `connect` halves of `create()`, run once every instance of the document is built. */
  connectors: Map<AnyPlugin, () => void>;
  /** How many changes the document has had since it opened: a download that read them all clears `hasUnsavedChanges`. */
  changeCount: number;
  /**
   * How many changes the document has had since it opened, on any engine and from any session:
   * a prepared print that saw fewer is prepared again before it prints.
   */
  changesSeen: number;
  close(): Promise<void>;
}

let instanceCounter = 0;

/** Engine rejections carry AbortError when close() aborts the live call;
 *  match structurally so test fakes with plain promises still work. */
const isAbortLike = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/**
 * Assemble a kernel from an engine + plugins.
 *
 *   planPlugins        — validate dependencies, order them
 *   resolveCapability  — workspace singletons (or their view from a document's scope),
 *                        or per-document instances built lazily
 *   settings           — one store per plugin registration, built up front, shared
 *                        by its instances and readable with no document
 *   document lifecycle — one DocumentSession per document: transactional open
 *                        (publish-last), one idempotent close for every phase
 *   start / destroy    — explicit status machine; destroy closes everything
 *
 * The kernel closes every handle it opened; it never destroys the engine —
 * ownership follows acquisition, and the engine was handed in by the caller.
 */
export function createKernel(config: {
  engine: Engine;
  plugins: AnyPlugin[];
  /** The viewer's own settings, over `VIEWER_DEFAULTS`: what `resetSettings()` goes back to. */
  settings?: DeepPartial<ViewerSettings>;
  /** Observability seam: teardown, listener and join failures land here. Default: console.error. */
  report?: (error: unknown) => void;
  /**
   * The host's time: what plugins' `ctx.clock` schedules on. A browser passes
   * `browserClock()` from `@embedpdf/web`, for frames. Default: `timerClock`,
   * timers and no frames.
   */
  clock?: HostClock;
  /**
   * The host's print dialog: where `documents.print()` sends the pages. A browser passes
   * `browserPrinter()` from `@embedpdf/web`. Without one, nothing prints (`canPrint()` is false).
   */
  printer?: HostPrinter;
  /**
   * How a `{ kind: 'url' }` source downloads: `fetch`'s own shape, called with the URL and the
   * document's cancel `signal`, and again on `retry()`. Yours adds headers or cookies. Default:
   * the global `fetch`.
   */
  fetch?: HostFetch;
}): Kernel {
  const { engine, plugins } = config;
  const report = config.report ?? ((error: unknown) => console.error('[kernel]', error));
  const store = createStore(report);
  const plan = planPlugins(plugins);
  const documentScopedPlugins = plan.ordered.filter(isDocumentScoped);

  const workspaceCapabilities = new Map<CapabilityToken<unknown>, unknown>();
  const workspaceLeases = new Map<AnyPlugin, SliceLease<unknown>>();
  const workspaceConnectors = new Map<AnyPlugin, () => void>();
  const workspaceCancel = new AbortController();
  const workspaceScope = createScope(report);
  /** How each workspace capability looks from inside a document's scope, by token. The
   *  documents capability is built in, so its view is declared here; plugins declare theirs. */
  const inScopeByToken = new Map<CapabilityToken<unknown>, NonNullable<AnyPlugin['inScope']>>([
    [DocumentsToken, documentsInScope],
  ]);
  for (const plugin of plan.ordered) {
    if (plugin.token && plugin.inScope && !isDocumentScoped(plugin)) {
      inScopeByToken.set(plugin.token, plugin.inScope);
    }
  }

  // ── lifecycle events (the kernel primitive; disposed at destroy) ──────────
  const opened = createEventHook<DocumentOpenedEvent>(report);
  const openFailed = createEventHook<DocumentOpenFailedEvent>(report);
  const locked = createEventHook<DocumentLockedEvent>(report);
  const closed = createEventHook<DocumentClosedEvent>(report);
  const activeChanged = createEventHook<DocumentActiveChangedEvent>(report);
  const pagesChanged = createEventHook<DocumentPagesChangedEvent>(report);
  const unsavedChangesChanged = createEventHook<DocumentUnsavedChangesChangedEvent>(report);
  workspaceScope.defer(() => {
    for (const hook of [
      opened,
      openFailed,
      locked,
      closed,
      activeChanged,
      pagesChanged,
      unsavedChangesChanged,
    ])
      hook.dispose();
  });
  /** Every core write goes through here so an active-tab change is observed exactly once. */
  const setCore = (patch: Partial<CoreState>): void => {
    const before = store.getCore().activeId;
    store.setCore(patch);
    const after = store.getCore().activeId;
    if (before !== after) activeChanged.emit({ documentId: after, previousDocumentId: before });
  };
  const sessions = new Map<string, DocumentSession>();

  let status: KernelStatus = 'created';
  let startPromise: Promise<void> | null = null;
  let destroyPromise: Promise<void> | null = null;

  const guardUsable = (what: string) => {
    if (status === 'failed' || status === 'destroying' || status === 'destroyed') {
      throw new Error(`[kernel] ${what} on a ${status} kernel`);
    }
  };

  // ── sessions ─────────────────────────────────────────────────────────────────

  const checkpoint = (session: DocumentSession) => {
    if (session.cancel.signal.aborted) {
      throw new CancelledError(`closed while opening: ${session.id}`);
    }
  };

  /**
   * Await an engine/network call under the session's cancellation:
   *   - the call is retained so close() can abort real worker-side work
   *     (`AbortablePromise`), and
   *   - the await races the cancellation, so close()'s join never blocks on a
   *     call that cannot be aborted (a plain-promise engine, a stuck fetch).
   * When cancellation wins but the call later lands anyway, `onLateResult`
   * routes the result into the session scope — whose late-defer rule runs it
   * immediately after disposal — so a late-arriving resource cannot leak.
   * (Plugin inits are deliberately not raced: they are first-party code that
   * close() joins to completion; only unbounded external waits are raced.)
   */
  async function engineCall<T>(
    session: DocumentSession,
    call: Promise<T>,
    onLateResult?: (value: T) => void | Promise<void>,
  ): Promise<T> {
    const abortable = call as Promise<T> & { abort?: (reason?: unknown) => void };
    session.engineOp = typeof abortable.abort === 'function' ? (abortable as never) : null;
    const signal = session.cancel.signal;
    let onAbort: (() => void) | undefined;
    const cancellation = new Promise<never>((_, reject) => {
      onAbort = () => reject(new CancelledError(`closed while opening: ${session.id}`));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([call, cancellation]);
    } catch (error) {
      if (isCancelled(error)) {
        void call.then(
          (value) => {
            if (onLateResult) session.scope.defer(() => onLateResult(value));
          },
          () => {}, // the abandoned call's own rejection is not separately actionable
        );
      }
      throw error;
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
      session.engineOp = null;
    }
  }

  function createSession(id: string, name: string | undefined): DocumentSession {
    const cancel = new AbortController();
    const session: DocumentSession = {
      id,
      instanceId: `${id}#${++instanceCounter}`,
      name,
      source: null,
      shareInput: null,
      openOptions: undefined,
      phase: 'opening',
      handle: null,
      stagedMeta: null,
      scope: createScope(report),
      operation: null,
      engineOp: null,
      cancel,
      signal: cancel.signal,
      capabilities: new Map(),
      building: new Set(),
      views: new Map(),
      connectors: new Map(),
      leases: new Map(),
      settleFlushes: new Set(),
      downloadWraps: [],
      printWraps: [],
      changes: createDocumentChanges({
        handle: () => session.handle,
        notify: () => store.notify(),
        report,
      }),
      changeCount: 0,
      changesSeen: 0,
      close: () => closeSession(session),
    };
    // A download waits for every change: open holds are sent, and the answers awaited.
    session.settleFlushes.add(() => session.changes.settle());
    session.scope.defer(() => session.changes.close());
    return session;
  }

  /** One transition at a time per session (open, then possibly unlock). */
  function beginOperation<T>(session: DocumentSession, run: () => Promise<T>): Promise<T> {
    if (session.operation) {
      throw new Error(`[documents] "${session.id}" already has an active transition`);
    }
    const operation = run().finally(() => {
      if (session.operation === operation) session.operation = null;
    });
    session.operation = operation;
    return operation;
  }

  /** Atomic ticket → real-id reconciliation: the sessions map, the store slot,
   *  order position, and activation all move together, or not at all. */
  function rekeySession(session: DocumentSession, nextId: string): void {
    const previousId = session.id;
    if (previousId === nextId) return;
    const core = store.getCore();
    if (sessions.has(nextId) || core.documents[nextId] || core.pending[nextId]) {
      throw new PluginError('conflict', 'documents', `duplicate document id: ${nextId}`);
    }
    sessions.delete(previousId);
    session.id = nextId;
    sessions.set(nextId, session);
    session.views.clear(); // a view is bound to the id it was built for
    const slot = core.pending[previousId];
    if (slot) {
      const { [previousId]: _moved, ...pending } = core.pending;
      setCore({
        pending: { ...pending, [nextId]: { ...slot, id: nextId } },
        order: core.order.map((id) => (id === previousId ? nextId : id)),
        activeId: core.activeId === previousId ? nextId : core.activeId,
      });
    }
  }

  const closingSessions = new WeakMap<DocumentSession, Promise<void>>();
  function closeSession(session: DocumentSession): Promise<void> {
    const inFlight = closingSessions.get(session);
    if (inFlight) return inFlight;
    const closing = (async () => {
      session.phase = 'closing';
      unpublishSlot(session.id); // synchronous: the tab disappears now
      for (const lease of session.leases.values()) lease.revoke(); // write authority ends now
      // Cancel, join the producer, then drain its resources — in that order.
      // After the join, no known producer can register more resources; the
      // scope's late-defer rule covers anything unknowable.
      const reason = new CancelledError(`closed while opening: ${session.id}`);
      session.cancel.abort(reason);
      session.engineOp?.abort(reason);
      await session.operation?.catch((error) => {
        if (!isCancelled(error) && !isAbortLike(error)) report(error);
      });
      await session.scope.dispose();
      if (sessions.get(session.id) === session) sessions.delete(session.id);
      session.views.clear();
      closed.emit({ documentId: session.id });
    })();
    closingSessions.set(session, closing);
    return closing;
  }

  // ── store projection (publish/unpublish) ─────────────────────────────────────

  function nextActiveDocument(core: CoreState, removedId: string): string | null {
    if (core.activeId !== removedId) return core.activeId;
    const index = core.order.indexOf(removedId);
    const remaining = core.order.filter((id) => id !== removedId);
    return remaining.length === 0 ? null : (remaining[Math.max(0, index - 1)] ?? remaining[0]);
  }

  function publishPendingSlot(session: DocumentSession, activate: boolean): void {
    const core = store.getCore();
    setCore({
      pending: {
        ...core.pending,
        [session.id]: { id: session.id, name: session.name, status: 'loading' },
      },
      // A failed document opened again (`retry()`) keeps its place.
      order: core.order.includes(session.id) ? core.order : [...core.order, session.id],
      activeId: activate || core.activeId === null ? session.id : core.activeId,
    });
  }

  function publishLocked(session: DocumentSession, passwordProvided: boolean): void {
    const core = store.getCore();
    setCore({
      pending: {
        ...core.pending,
        [session.id]: { id: session.id, name: session.name, status: 'locked', passwordProvided },
      },
    });
    locked.emit({ documentId: session.id, passwordProvided });
  }

  function publishError(session: DocumentSession, error: unknown): void {
    const core = store.getCore();
    const shareRequest = shareRequestOf(error, session.shareInput);
    setCore({
      pending: {
        ...core.pending,
        [session.id]: {
          id: session.id,
          name: session.name,
          status: 'error',
          error,
          ...(shareRequest ? { shareRequest } : {}),
        },
      },
    });
    openFailed.emit({
      documentId: session.id,
      error: toPluginErrorInfo(toPluginError('documents', error)),
    });
  }

  function unpublishSlot(id: string): void {
    const core = store.getCore();
    if (!core.pending[id] && !core.documents[id]) return;
    const { [id]: _pending, ...pending } = core.pending;
    const { [id]: _document, ...documents } = core.documents;
    setCore({
      pending,
      documents,
      order: core.order.filter((other) => other !== id),
      activeId: nextActiveDocument(core, id),
    });
  }

  /** The one ready transition: swap the pending slot for the staged meta and
   *  announce `onOpened`. Everything before this is unpublished and rolls
   *  back by disposing the session scope; nothing after this can fail. */
  function commitReady(session: DocumentSession): void {
    session.phase = 'ready';
    const meta = session.stagedMeta!;
    const core = store.getCore();
    const { [session.id]: _resolved, ...pending } = core.pending;
    setCore({ documents: { ...core.documents, [session.id]: meta }, pending });
    // A share link that asks before the first change: a change waiting for the answers shows
    // on the document until the visitor gives them or declines.
    // A passphrase or questions the link got after it opened show the same way, until given.
    const share = session.handle?.share;
    if (share) {
      session.scope.defer(
        share.onIdentityRequest((request) => setIdentityRequest(session, request)),
      );
      session.scope.defer(share.onOpenRequest((request) => setShareRequest(session, request)));
    }
    opened.emit({ documentId: session.id, info: documentInfoOf(meta) });
  }

  /** Show, or stop showing, that the share link asks before the document goes on. */
  function setShareRequest(session: DocumentSession, request: ShareOpenRequest | null): void {
    const core = store.getCore();
    const published = core.documents[session.id];
    if (!published || (published.shareRequest ?? null) === request) return;
    const { shareRequest: _shown, ...rest } = published;
    setCore({
      documents: {
        ...core.documents,
        [session.id]: request ? { ...rest, shareRequest: request } : rest,
      },
    });
  }

  /** Give a ready document's share link what it asks (`shareRequest`): it goes on as the same visitor. */
  async function resumeShare(session: DocumentSession, options: RetryOptions | undefined) {
    const share = session.handle!.share!;
    const { sharePassword, identity } = options ?? {};
    try {
      await share.resume({
        ...(sharePassword !== undefined ? { sharePassword } : {}),
        ...(identity !== undefined ? { identity } : {}),
      });
    } catch (error) {
      // Still asked: the request shows what's wrong or missing.
      setShareRequest(session, share.openRequest);
      throw toPluginError('documents', error);
    }
    setShareRequest(session, share.openRequest);
    return { document: getDocument(session.id)! };
  }

  /** Show, or stop showing, that a change waits for the visitor's answers. */
  function setIdentityRequest(
    session: DocumentSession,
    request: VisitorIdentityRequest | null,
  ): void {
    const core = store.getCore();
    const published = core.documents[session.id];
    if (!published || (published.identityRequest ?? null) === request) return;
    const { identityRequest: _shown, ...rest } = published;
    setCore({
      documents: {
        ...core.documents,
        [session.id]: request ? { ...rest, identityRequest: request } : rest,
      },
    });
  }

  async function identify(id: string, answers: VisitorAnswers): Promise<void> {
    const session = readySession(id, 'identify');
    const share = session.handle!.share;
    if (!share) {
      throw new PluginError('invalid-input', 'documents', `${id} isn't from a share link`);
    }
    try {
      await share.identify(answers);
    } catch (error) {
      // Still asked: the request shows what's missing or can't be taken.
      const request = visitorIdentityRequestOf(error);
      if (request) setIdentityRequest(session, request);
      throw toPluginError('documents', error);
    }
    setIdentityRequest(session, share.identityRequest);
  }

  function declineIdentity(id: string): void {
    const session = readySession(id, 'decline');
    session.handle!.share?.decline();
    setIdentityRequest(session, null);
  }

  /**
   * The document changed, or a download read every change it had: set `hasUnsavedChanges` and
   * announce a flip. Before the document is published, its staged meta carries the flag.
   */
  function setUnsavedChanges(session: DocumentSession, hasUnsavedChanges: boolean): void {
    const core = store.getCore();
    const published = core.documents[session.id];
    if (!published) {
      if (session.stagedMeta && session.stagedMeta.hasUnsavedChanges !== hasUnsavedChanges) {
        session.stagedMeta = { ...session.stagedMeta, hasUnsavedChanges };
      }
      return;
    }
    if (published.hasUnsavedChanges === hasUnsavedChanges) return;
    setCore({
      documents: { ...core.documents, [session.id]: { ...published, hasUnsavedChanges } },
    });
    unsavedChangesChanged.emit({ documentId: session.id, hasUnsavedChanges });
  }

  // ── capability resolution ────────────────────────────────────────────────────

  const sessionOf = (documentId?: string): DocumentSession | null => {
    const id = documentId ?? store.getCore().activeId;
    return id ? (sessions.get(id) ?? null) : null;
  };

  /** The handle plugins may touch: bring-up or ready — never locked, never
   *  a handle whose close already won. */
  const documentHandle = (documentId?: string): DocumentHandle | null => {
    const session = sessionOf(documentId);
    if (!session) return null;
    return session.phase === 'bringup' || session.phase === 'ready' ? session.handle : null;
  };

  /** The session a per-document verb acts on: `documentId`, or the active document. */
  function readySession(documentId: string | undefined, verb: string): DocumentSession {
    const session = sessionOf(documentId);
    if (!session || !documentHandle(session.id)) {
      throw new PluginError('not-ready', 'documents', `no open document to ${verb}`);
    }
    return session;
  }

  const allowsOn = (documentId: string | undefined, permission: Permission): boolean => {
    const handle = documentHandle(documentId);
    return handle ? sessionAllows(handle.security, permission) : false;
  };

  /**
   * Read the document's file, with everything the user sees: refuse without `doc.download`, let
   * it settle (what its plugins held back is sent and answered, settle.ts), then read it inside
   * every `aroundDownload` wrap (the document's own save actions). A read that saw every change
   * the document had clears `hasUnsavedChanges`; a change during the read, or after it (a
   * did-save script), keeps it. Closing the document, or `signal`, cancels it.
   */
  async function downloadFile(
    documentId: string | undefined,
    signal: AbortSignal | undefined,
    verb: string,
    read: (handle: DocumentHandle) => Promise<Uint8Array>,
    refuse?: (handle: DocumentHandle) => PluginError | null,
  ): Promise<Uint8Array> {
    const session = readySession(documentId, verb);
    if (!allowsOn(session.id, 'doc.download')) {
      throw permissionDenied('documents', 'doc.download', `documents.${verb}`);
    }
    const refusal = refuse?.(session.handle!);
    if (refusal) throw refusal;
    try {
      await settle(session.settleFlushes, [signal, session.signal], report);
      // The same document, even if another became active while it settled.
      const handle = documentHandle(session.id);
      if (!handle) throw new PluginError('not-ready', 'documents', `no open document to ${verb}`);
      let readAt = -1;
      const readFile = () => {
        readAt = session.changeCount;
        return cancellable('documents', signal, read(handle));
      };
      const bytes = await runWrapped(session.downloadWraps, readFile);
      if (readAt === session.changeCount) setUnsavedChanges(session, false);
      return bytes;
    } catch (error) {
      throw toPluginError('documents', error);
    }
  }

  // ── printing ─────────────────────────────────────────────────────────────

  const printer = config.printer ?? null;

  const canPrintOn = (documentId: string | undefined): boolean =>
    printer !== null && allowsOn(documentId, 'doc.print');

  /**
   * How a print comes out: the PDF copy with `doc.print.high`, a right to keep the copy (every
   * print dialog can save it as a file) and a printer that prints a PDF; else pictures, at the
   * resolution `doc.print.high` or `doc.print` allows.
   */
  const printQualityOf = (documentId: string | undefined): PrintQuality | null => {
    if (!canPrintOn(documentId)) return null;
    if (!allowsOn(documentId, 'doc.print.high')) return PRINT_STANDARD;
    const mayKeepCopy =
      allowsOn(documentId, 'doc.download') || allowsOn(documentId, 'doc.download.flattened');
    return mayKeepCopy && printer?.stagePdf ? PRINT_PDF : PRINT_HIGH;
  };

  /** The pages a print asks for, in its order: every page when it names none. */
  function printPagesOf(
    session: DocumentSession,
    pages: readonly PageRef[] | undefined,
  ): readonly PageInfo[] {
    const all = metaOf(session.id)?.pages ?? EMPTY_PAGES;
    if (pages === undefined) return all;
    if (pages.length === 0) {
      throw new PluginError('invalid-input', 'documents', 'a print needs at least one page');
    }
    const found = pages.map((ref) => {
      const page = findPage(all, ref);
      if (!page) {
        throw new PluginError(
          'not-found',
          'documents',
          `page ${ref.objectNumber} is not in this document`,
        );
      }
      return page;
    });
    if (new Set(found).size !== found.length) {
      throw new PluginError('invalid-input', 'documents', 'a print names a page twice');
    }
    return found;
  }

  /**
   * What prints beside the page content: the annotations as the options ask, by default when
   * the user may read them; the form fields whenever the user may read the form.
   */
  const printLayersOf = (documentId: string, options: PrintOptions) => ({
    includeAnnotations: options.includeAnnotations ?? allowsOn(documentId, 'doc.annotate.read'),
    includeFormFields: allowsOn(documentId, 'doc.forms.read'),
  });

  /**
   * Make the pages as they print and hand them to the printer, once the document settled: the
   * PDF copy, or a picture of each page. The pages are looked up again each time, so one deleted
   * meanwhile refuses `not-found`. Returns the staged print, how it came out, and the change it
   * saw last, so a print can tell it went stale.
   */
  async function stagePrint(
    session: DocumentSession,
    activePrinter: HostPrinter,
    quality: PrintQuality,
    options: PrintOptions,
  ): Promise<{ staged: StagedPrint; quality: PrintQuality; changesSeen: number }> {
    const { signal } = options;
    await settle(session.settleFlushes, [signal, session.signal], report);
    const handle = documentHandle(session.id);
    if (!handle) throw new PluginError('not-ready', 'documents', 'no open document to print');
    const changesSeen = session.changesSeen;
    const job: PrintJob = {
      handle,
      pages: printPagesOf(session, options.pages),
      layers: printLayersOf(session.id, options),
      name: session.name ?? 'document',
      options,
    };
    options.onProgress?.({ pagesRendered: 0, pageCount: job.pages.length });
    if (quality.kind === 'images') {
      return { staged: await stagePictures(job, activePrinter, quality.dpi), quality, changesSeen };
    }
    try {
      return { staged: await stagePdfCopy(job, activePrinter), quality, changesSeen };
    } catch (error) {
      // A printer can turn the PDF copy down (a browser that reports a PDF viewer it doesn't
      // show): the same pages print as pictures.
      if (signal?.aborted) throw error;
      const staged = await stagePictures(job, activePrinter, PRINT_HIGH.dpi);
      return { staged, quality: PRINT_HIGH, changesSeen };
    }
  }

  /** The PDF copy of the pages as they print, staged with the printer. */
  async function stagePdfCopy(job: PrintJob, activePrinter: HostPrinter): Promise<StagedPrint> {
    const { handle, pages, layers, name, options } = job;
    const { signal } = options;
    if (!activePrinter.stagePdf) {
      throw new PluginError('unsupported', 'documents', 'this printer prints no PDF');
    }
    const pdf = await cancellable(
      'documents',
      signal,
      handle.pages.extract(
        pages.map((page) => page.ref),
        { flatten: { usage: 'print' }, ...layers },
      ),
    );
    const staged = await activePrinter.stagePdf(pdf, { name, ...(signal ? { signal } : {}) });
    options.onProgress?.({ pagesRendered: pages.length, pageCount: pages.length });
    return staged;
  }

  /** A picture of each page, drawn by the print rules at `dpi`, staged with the printer. */
  async function stagePictures(
    job: PrintJob,
    activePrinter: HostPrinter,
    dpi: PrintDpi,
  ): Promise<StagedPrint> {
    const { handle, pages, layers, name, options } = job;
    const { signal } = options;
    const sheets: PrintSheet[] = [];
    for (const page of pages) {
      const image = await cancellable(
        'documents',
        signal,
        handle.page(page.ref).render.image({
          usage: 'print',
          viewport: { kind: 'dpi', dpi },
          format: 'png',
          ...layers,
        }),
      );
      const blob = await cancellable('documents', signal, image.blob());
      sheets.push({ image: blob, widthPt: page.size.width, heightPt: page.size.height });
      options.onProgress?.({ pagesRendered: sheets.length, pageCount: pages.length });
    }
    return activePrinter.stage(sheets, { name, ...(signal ? { signal } : {}) });
  }

  /**
   * Get a print ready. Refused before anything runs without `doc.print` or a printer, or for
   * pages the document doesn't have. Its `print()` runs inside every `aroundPrint` wrap (the
   * document's own print actions), and prepares again first when the document changed since:
   * a will-print action that fills in a date is on the paper. When the printer turns the PDF
   * copy down, preparing or printing, the same pages print as pictures, and `quality` says so.
   */
  async function preparePrint(
    documentId: string | undefined,
    options: PrintOptions = {},
  ): Promise<PreparedPrint> {
    const session = readySession(documentId, 'preparePrint');
    if (!allowsOn(session.id, 'doc.print')) {
      throw permissionDenied('documents', 'doc.print', 'documents.preparePrint');
    }
    const quality = printQualityOf(session.id);
    if (!printer || !quality) {
      throw new PluginError(
        'unsupported',
        'documents',
        'no printer: pass one to createKernel({ printer }), such as browserPrinter() from @embedpdf/web',
      );
    }
    const pageCount = printPagesOf(session, options.pages).length;
    try {
      let {
        staged,
        changesSeen,
        quality: printed,
      } = await stagePrint(session, printer, quality, options);
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        staged.dispose();
      };
      session.scope.defer(dispose);
      /** Stage the print again, as `as`, in place of what was staged. */
      const restage = async (as: PrintQuality, signal: AbortSignal | undefined) => {
        const fresh = await stagePrint(session, printer, as, {
          ...(options.pages ? { pages: options.pages } : {}),
          ...(options.includeAnnotations !== undefined
            ? { includeAnnotations: options.includeAnnotations }
            : {}),
          ...(signal ? { signal } : {}),
        });
        staged.dispose();
        ({ staged, changesSeen, quality: printed } = fresh);
      };
      return {
        get quality() {
          return printed;
        },
        pageCount,
        needsTap: printer.needsTap === true,
        async print(printOptions) {
          if (disposed) {
            throw new PluginError('invalid-input', 'documents', 'this print was disposed');
          }
          const signal = printOptions?.signal;
          const run = async () => {
            if (session.changesSeen !== changesSeen) await restage(quality, signal);
            if (signal?.aborted) {
              throw new PluginError('operation-cancelled', 'documents', 'print cancelled', {
                cause: signal.reason,
              });
            }
            try {
              await staged.print();
            } catch (error) {
              if (printed.kind !== 'pdf') throw error;
              await restage(PRINT_HIGH, signal);
              await staged.print();
            }
          };
          try {
            await runWrapped(session.printWraps, run);
          } catch (error) {
            throw toPluginError('documents', error);
          }
        },
        dispose,
      };
    } catch (error) {
      throw toPluginError('documents', error);
    }
  }

  /** Whether the plugin's `create()` is running for this document: it has no capability yet. */
  const isBuilding = (plugin: AnyPlugin, session: DocumentSession): boolean =>
    session.building.has(plugin) && !session.capabilities.has(plugin);

  function buildDocumentCapability(plugin: AnyPlugin, session: DocumentSession): unknown {
    let capability = session.capabilities.get(plugin);
    if (!capability) {
      // A second instance would take the first one's state slice and mirror cells, leaving the
      // connected one with cells it can no longer write.
      if (session.building.has(plugin)) {
        throw new PluginError(
          'not-ready',
          plugin.id,
          `"${plugin.id}" was asked for while it is being created`,
        );
      }
      const ctx = createPluginContext(services, plugin, session, session.signal, session.scope);
      session.building.add(plugin);
      let created: ReturnType<AnyPlugin['create']>;
      try {
        created = plugin.create(ctx);
      } finally {
        session.building.delete(plugin);
      }
      const { api, connect } = created;
      capability = api;
      session.connectors.set(plugin, () => {
        connect?.();
        markConnected(ctx);
      });
      session.capabilities.set(plugin, capability);
    }
    return capability;
  }

  /**
   * A workspace capability as a document's scope sees it: the view its plugin declares
   * (`inScope`), built once per document and kept on the session, so it is the same object on
   * every call and goes when the document closes. Without a document, or for a document the
   * kernel doesn't know, it is the capability itself.
   */
  function workspaceViewOf<T>(
    token: CapabilityToken<T>,
    capability: T,
    documentId: string | undefined,
  ): T {
    const inScope = inScopeByToken.get(token);
    const session = documentId === undefined ? undefined : sessions.get(documentId);
    if (!inScope || !session) return capability;
    let view = session.views.get(token);
    if (view === undefined) {
      view = inScope(capability, session.id);
      session.views.set(token, view);
    }
    return view as T;
  }

  function resolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T {
    guardUsable(`capability("${token.name}")`);
    const workspaceCapability = workspaceCapabilities.get(token);
    if (workspaceCapability) return workspaceViewOf(token, workspaceCapability as T, documentId);
    const provider = plan.providerOf(token);
    if (!provider) throw new Error(`No capability "${token.name}".`);
    const id = documentId ?? store.getCore().activeId;
    if (!id) throw new Error(`Capability "${token.name}" requires an active document.`);
    const session = sessions.get(id);
    if (!session) throw new Error(`Capability "${token.name}" unavailable: no document "${id}".`);
    if (session.phase === 'bringup' || session.phase === 'ready') {
      return buildDocumentCapability(provider, session) as T;
    }
    // Fail fast and truthfully: a loading/locked/error document has no
    // plugin instances yet. `useOptional*` adapters turn this into their
    // fallback; strict resolution surfaces the real state.
    const shown = session.phase === 'opening' ? 'loading' : session.phase;
    throw new Error(`Capability "${token.name}" unavailable: document "${id}" is ${shown}.`);
  }

  /** Internal total resolver: bring-up counts, so a plugin's `ctx.tryGet`
   *  works during its own document's init. */
  function tryResolveInternal<T>(token: CapabilityToken<T>, documentId?: string): T | null {
    if (status === 'destroying' || status === 'destroyed') return null;
    const workspaceCapability = workspaceCapabilities.get(token);
    if (workspaceCapability) return workspaceViewOf(token, workspaceCapability as T, documentId);
    const provider = plan.providerOf(token);
    if (!provider) return null;
    const session = sessionOf(documentId);
    if (!session || (session.phase !== 'bringup' && session.phase !== 'ready')) return null;
    if (isBuilding(provider, session)) return null;
    return buildDocumentCapability(provider, session) as T;
  }

  /** Public total resolver — see `Kernel.tryCapability`. `ready` only: the
   *  null→instance flip at commit time is the adapters' re-render signal. */
  function tryResolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T | null {
    if (status === 'destroying' || status === 'destroyed') return null;
    const workspaceCapability = workspaceCapabilities.get(token);
    if (workspaceCapability) return workspaceViewOf(token, workspaceCapability as T, documentId);
    const provider = plan.providerOf(token);
    if (!provider) return null;
    const session = sessionOf(documentId);
    if (!session || session.phase !== 'ready') return null;
    if (isBuilding(provider, session)) return null;
    return buildDocumentCapability(provider, session) as T;
  }

  // ── settings ─────────────────────────────────────────────────────────────────
  // The viewer's own settings: one store, read when a document opens (its scope and identity)
  // and by every adapter that paints (the accent, the page).
  const viewerSettings = createSettingsStore<ViewerSettings>(
    { defaults: VIEWER_DEFAULTS, registered: config.settings, whole: VIEWER_WHOLE_SETTINGS },
    store.notify,
    report,
  );
  workspaceScope.defer(() => viewerSettings.dispose());

  // A plugin's settings belong to the plugin as the app registered it, not to one document.
  // Each registration's store is built here, before any plugin is created, so the settings
  // can be read and changed before any document opens. Every instance of the plugin then
  // shares it, so a change reaches every open document and the ones opened later, and wakes
  // every reader through the store's one change stream.
  const settingsStores = new Map<AnyPlugin, SettingsStore<object>>();
  for (const plugin of plan.ordered) {
    if (plugin.settings) {
      settingsStores.set(plugin, createSettingsStore(plugin.settings, store.notify, report));
    }
  }
  // Destroy ends the listeners; the values stay readable, so a reader unmounting late never throws.
  workspaceScope.defer(() => {
    for (const settings of settingsStores.values()) settings.dispose();
  });

  function settingsOf<C>(token: CapabilityToken<C>): SettingsApi<SettingsOf<C>> {
    const provider = plan.providerOf(token);
    if (!provider) throw new Error(`No capability "${token.name}".`);
    const settings = settingsStores.get(provider);
    if (!settings) throw new Error(`Plugin "${provider.id}" has no settings.`);
    // The token's capability type names the settings type; the store was built untyped.
    return settings.api as unknown as SettingsApi<SettingsOf<C>>;
  }

  const services: ContextServices = {
    engine,
    store,
    workspaceScope,
    workspaceSignal: workspaceCancel.signal,
    workspaceLeases,
    report,
    clock: config.clock ?? timerClock,
    resolveCapability,
    tryResolveCapability: tryResolveInternal,
    documentHandle,
    settingsStoreOf: (plugin) => settingsStores.get(plugin),
  };

  // ── document lifecycle ───────────────────────────────────────────────────────

  // Tickets for slots whose real id isn't known yet (thunk sources).
  let ticketCounter = 0;
  const nextTicket = () => `pending:${++ticketCounter}`;

  /** Slices, the registry's event subscription, and every plugin's
   *  construction and connection — every step's release deferred into the
   *  session scope, every await followed by a checkpoint. Runs entirely
   *  pre-commit: a failure anywhere rolls the whole session back and the
   *  document was never `ready`. */
  async function bringUp(
    session: DocumentSession,
    snapshot: { pageCount: number; pages: DocumentMeta['pages'] },
  ): Promise<void> {
    session.phase = 'bringup';
    // The render policy is a document fact (Pattern A, like the page
    // registry): async on the engine contract, materialized once here —
    // pre-publish — so every consumer reads it synchronously off the meta
    // and no "policy still resolving" state exists anywhere downstream.
    // Best-effort by design: no render service, or a failed read, means
    // `continuous` — a policy hiccup must never block a document open.
    let renderPolicy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY;
    try {
      renderPolicy = (await session.handle!.render?.getPolicy()) ?? CONTINUOUS_RENDER_POLICY;
    } catch {
      /* unreachable policy = continuous */
    }
    checkpoint(session);
    session.stagedMeta = {
      id: session.id,
      instanceId: session.instanceId,
      name: session.name,
      pageCount: snapshot.pageCount,
      pages: snapshot.pages,
      revision: 0,
      renderPolicy,
      hasUnsavedChanges: false,
    };

    // Changes are unsaved only where they live in this tab until a download (the local
    // engine); the cloud engine stores each one as it's made.
    const tracksChanges = isLocalDocument(session.handle!);
    // Document mutation events (rotate/move/delete) replace the page
    // registry in place — the snapshot they carry is byte-identical to
    // pages.list(), so this is a direct swap, no merge. Own mutations and
    // remote (collaborator) mutations arrive identically; the handler is
    // origin-agnostic, as the event model intends.
    // The kernel listens first and last, so a change's events land as one store update.
    const bursts = createBurstGate(store);
    session.scope.defer(bursts.close);
    const unsubscribeEvents = session.handle!.events.subscribe((event) => {
      bursts.first(event);
      if (changesDocument(event)) {
        session.changesSeen += 1;
        if (tracksChanges) {
          session.changeCount += 1;
          setUnsavedChanges(session, true);
        }
      }
      const layout = layoutFromEvent(event);
      if (!layout) return;
      const now = store.getCore();
      const existing = now.documents[session.id];
      if (!existing) return; // pre-commit or closed — registry not published
      const updated: DocumentMeta = {
        ...existing,
        pageCount: layout.pageCount,
        pages: layout.pages,
        revision: existing.revision + 1,
      };
      setCore({ documents: { ...now.documents, [session.id]: updated } });
      pagesChanged.emit({
        documentId: session.id,
        revision: updated.revision,
        pages: updated.pages,
      });
    });
    session.scope.defer(unsubscribeEvents);

    for (const plugin of documentScopedPlugins) {
      // The lease is the write authority for this instance's slice. Revoking it
      // is the first teardown to run at close (LIFO), synchronously, so nothing
      // retained by this instance can reach a reopened document's state.
      const lease = store.lease(
        sliceKey(plugin.id, session.id),
        initialStateOf(plugin),
        session.instanceId,
      );
      session.leases.set(plugin, lease);
      session.scope.defer(() => lease.revoke()); // LIFO ⇒ reverse dependency order
    }
    // Construction and connection are part of the transaction (either can
    // throw); the callbacks they register fire post-commit and are isolated
    // by the store instead. Eager, in dependency order, with the store's change
    // stream held: a `create()` writes state, and a listener told of it at once
    // could read a plugin that isn't built yet and build it out of order,
    // before the plugins it finds while it's created. Listeners hear of the
    // whole bring-up in one pass, once every plugin is there.
    const release = store.hold();
    try {
      for (const plugin of documentScopedPlugins) {
        buildDocumentCapability(plugin, session);
        session.connectors.get(plugin)?.();
      }
    } finally {
      release();
    }
    session.scope.defer(session.handle!.events.subscribe((event) => bursts.last(event)));
    checkpoint(session);
  }

  /** What `open()` and `retry()` resolve: the document as its tab shows it, ready or locked. */
  function openedResult(session: DocumentSession): OpenDocumentResult {
    const core = store.getCore();
    const entry = core.documents[session.id] ?? core.pending[session.id];
    if (!entry) throw new PluginError('instance-closed', 'documents', `${session.id} was closed`);
    return { document: documentInfoOf(entry) };
  }

  // `async` on purpose: a refused reservation (duplicate id, destroyed kernel)
  // is a rejection, never a synchronous throw, like every other open failure.
  async function openDocument(
    input: OpenSource,
    options?: OpenDocumentOptions,
    slotId?: string,
  ): Promise<OpenDocumentResult> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new PluginError('operation-cancelled', 'documents', 'the open was cancelled');
    }
    try {
      const { session, done } = reserveAndOpen(input, options, slotId);
      // Cancelling closes the document while it opens; once it's open, the signal is spent.
      const cancel = () => void session.close();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        return openedResult(await done);
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    } catch (error) {
      throw toPluginError('documents', error);
    }
  }

  /**
   * The engine's open options for a document: its own, and the viewer's `scope` and
   * `identity` where it has none. A document's own replace the viewer's, never merge.
   */
  function engineOptionsOf(options: OpenDocumentOptions | undefined) {
    const { activate: _activate, name: _name, signal: _signal, ...own } = options ?? {};
    const viewer = viewerSettings.api.getSettings();
    const scope = own.scope ?? viewer.scope ?? undefined;
    const identity = own.identity ?? viewer.identity ?? undefined;
    return {
      ...own,
      ...(scope !== undefined ? { scope } : {}),
      ...(identity !== undefined ? { identity } : {}),
    };
  }

  /**
   * Reserve the tab slot synchronously and start the open; returns the slot id at once.
   * `slotId` is a failed document's tab, which `retry()` opens again in place.
   */
  function reserveAndOpen(
    input: OpenSource,
    options?: OpenDocumentOptions,
    slotId?: string,
  ): { session: DocumentSession; done: Promise<DocumentSession> } {
    guardUsable('documents.open()');
    const engineOptions = engineOptionsOf(options);

    // 1. Reserve the tab slot synchronously (before the first await): id,
    //    order position, and activation are decided at request time; only the
    //    content arrives at completion time. Fire-and-forget concurrent opens
    //    therefore keep call order as tab order.
    const requestedId =
      slotId ?? (typeof input === 'function' ? nextTicket() : (idOfInput(input) ?? nextTicket()));
    if (sessions.has(requestedId)) {
      throw new PluginError('conflict', 'documents', `document already open: ${requestedId}`);
    }
    const session = createSession(requestedId, options?.name);
    session.source = input;
    session.openOptions = options;
    sessions.set(session.id, session);
    publishPendingSlot(session, options?.activate ?? true);

    const done = beginOperation(session, async () => {
      try {
        const given =
          typeof input === 'function'
            ? await engineCall(session, Promise.resolve(input(session.cancel.signal)))
            : input;
        checkpoint(session);
        // A URL is downloaded here, under the loading tab; closing the tab stops the download.
        const source = isUrlSource(given)
          ? await engineCall(session, fetchUrlSource(given, session.cancel.signal, config.fetch))
          : given;
        checkpoint(session);
        session.shareInput = source.kind === 'share' ? source : null;
        const sourceId = idOfInput(source);
        if (sourceId) rekeySession(session, sourceId);

        // A handle that lands after close() won still gets closed — see engineCall.
        const handle = await engineCall(session, engine.open(source, engineOptions), (late) =>
          late.close(),
        );
        session.handle = handle;
        session.scope.defer(() => handle.close()); // paired at acquisition — no exit path leaks it
        checkpoint(session);
        if (handle.id !== session.id) rekeySession(session, handle.id);

        // 2. A password-locked handle parks here — before pages.list(), which
        //    would reject on a locked document. `documents.unlock()` finishes
        //    the job later. The prompt's `incorrect` says a supplied password
        //    was tried and rejected (drives the "incorrect" copy).
        const prompt = handle.security?.passwordPrompt;
        if (prompt?.state === 'required') {
          session.phase = 'locked';
          publishLocked(session, prompt.incorrect);
          return session;
        }

        const snapshot = await engineCall(session, handle.pages.list());
        checkpoint(session);
        await bringUp(session, snapshot);
        commitReady(session);
        return session;
      } catch (error) {
        // Close won the race: close() owns unpublish + disposal; just get out
        // of its way, rejecting with the typed cancellation either way.
        if (isCancelled(error)) throw error;
        if (session.phase === 'closing' || isAbortLike(error)) {
          throw new CancelledError(`closed while opening: ${session.id}`);
        }
        // 3. Real failure: Rollback (scope releases exactly what was acquired,
        //    however far we got), then park the tab as `error` — closable, and
        //    reopenable after close. The document was never `ready`.
        await session.scope.dispose();
        session.phase = 'error';
        publishError(session, error);
        throw error;
      }
    });
    return { session, done };
  }

  async function unlockDocument(id: string, options: UnlockOptions): Promise<void> {
    guardUsable('documents.unlock()');
    const session = sessions.get(id);
    if (!session || session.phase !== 'locked' || !session.handle) {
      throw new PluginError('invalid-input', 'documents', `document is not locked: ${id}`);
    }
    const handle = session.handle;
    return beginOperation(session, async () => {
      // Engine-agnostic by design: local loads the parked worker bytes, cloud
      // POSTs /access — same call, same result. A wrong password rejects here
      // and nothing changes: the document stays locked, unlock is retryable,
      // and so does a password check the caller's signal stopped.
      try {
        await cancellable(
          'documents',
          options.signal,
          engineCall(session, handle.security.unlock({ password: options.password })),
        );
      } catch (error) {
        if (session.phase === 'closing' || isAbortLike(error)) {
          throw new CancelledError(`closed while opening: ${session.id}`);
        }
        throw error; // still locked — deliberately no state change
      }
      checkpoint(session);
      // Past the password: failures from here are real open failures — the
      // same rollback + `error` policy as the open path.
      try {
        const snapshot = await engineCall(session, handle.pages.list());
        checkpoint(session);
        await bringUp(session, snapshot);
        commitReady(session);
      } catch (error) {
        if (isCancelled(error)) throw error;
        if (session.phase === 'closing' || isAbortLike(error)) {
          throw new CancelledError(`closed while opening: ${session.id}`);
        }
        await session.scope.dispose();
        session.phase = 'error';
        publishError(session, error);
        throw error;
      }
    }).catch((error: unknown) => {
      throw toPluginError('documents', error);
    });
  }

  async function closeDocument(documentId: string): Promise<void> {
    const session = sessions.get(documentId);
    if (!session) return; // idempotent — unknown or already closed
    await session.close();
  }

  function reorder(next: string[]) {
    setCore({ order: next });
  }

  const metaOf = (documentId?: string): DocumentMeta | null => {
    const core = store.getCore();
    const id = documentId ?? core.activeId;
    return id ? (core.documents[id] ?? null) : null;
  };

  /** The tab list: the same array until one of its documents changes, or the order does. */
  let listMemo: { core: CoreState; value: readonly DocumentInfo[] } | null = null;
  const listDocuments = (): readonly DocumentInfo[] => {
    const core = store.getCore();
    if (listMemo?.core === core) return listMemo.value;
    const next = core.order.map((id) => documentInfoOf(core.documents[id] ?? core.pending[id]));
    const previous = listMemo?.value;
    const same =
      previous !== undefined &&
      previous.length === next.length &&
      previous.every((info, i) => info === next[i]);
    const value = same ? previous : Object.freeze(next);
    listMemo = { core, value };
    return value;
  };

  /** A document's fields: `documentId`, or the active document's. */
  const getDocument = (documentId?: string): DocumentInfo | null => {
    const core = store.getCore();
    const id = documentId ?? core.activeId;
    const entry = id ? (core.documents[id] ?? core.pending[id]) : undefined;
    return entry ? documentInfoOf(entry) : null;
  };

  const documents: DocumentsCapability = {
    open: openDocument,
    // A file's bytes are the engine's to take or refuse: it says which.
    canOpenFiles: () => engine.canOpenFiles,
    retry: async (id, options) => {
      const session = sessions.get(id);
      if (session?.phase === 'ready' && session.handle?.share?.openRequest) {
        return resumeShare(session, options);
      }
      if (!session || session.phase !== 'error' || session.source === null) {
        throw new PluginError(
          'invalid-input',
          'documents',
          `${id} didn't fail to open; nothing to retry`,
        );
      }
      // In its own tab, which keeps its id and place; the active document stays the active one.
      // The failed session holds nothing (its scope was released when it failed), so the new
      // one takes its id without closing it: the tab never closes.
      const { source, shareInput, openOptions } = session;
      const given = retrySourceOf(source, shareInput, options);
      // The visitor's answers join who the page said the user is: the document's own, else the
      // viewer's.
      const identity =
        options?.identity !== undefined
          ? { ...engineOptionsOf(openOptions).identity, ...options.identity }
          : undefined;
      sessions.delete(id);
      return openDocument(
        given,
        {
          ...openOptions,
          ...(identity !== undefined ? { identity } : {}),
          activate: false,
          signal: options?.signal,
        },
        id,
      );
    },
    identify,
    declineIdentity,
    rename: (id, name) => {
      const core = store.getCore();
      if (core.documents[id]) {
        setCore({ documents: { ...core.documents, [id]: { ...core.documents[id], name } } });
      } else if (core.pending[id]) {
        setCore({ pending: { ...core.pending, [id]: { ...core.pending[id], name } } });
      }
      const session = sessions.get(id);
      if (session) session.name = name;
    },
    openAll: (initialDocuments) => {
      guardUsable('documents.openAll()');
      // Fire-and-forget on purpose: each open() reserves its tab slot
      // synchronously, so tabs exist immediately in array order; exactly one
      // activation, decided here at request time. Failures are tab state
      // (`error`/`locked`), never unhandled rejections.
      const activeIndex = Math.max(
        0,
        initialDocuments.findIndex((initialDocument) => initialDocument.active),
      );
      // The returned ids are the reserved slots: a thunk source's ticket is
      // rekeyed to the real id on resolve (`onOpened` carries the final id).
      return initialDocuments.map(({ source, active: _active, ...options }, index) => {
        try {
          const { session, done } = reserveAndOpen(source, {
            ...options,
            activate: index === activeIndex,
          });
          void done.catch(() => {});
          return session.id;
        } catch {
          // A refused reservation (an id already open) is not a boot failure:
          // the existing tab stands; report the id the caller asked for.
          return typeof source === 'function' ? '' : (idOfInput(source) ?? '');
        }
      });
    },
    unlock: unlockDocument,
    close: closeDocument,
    closeAll: async () => {
      for (const id of [...store.getCore().order]) await closeDocument(id);
    },
    setActive: (id) => {
      const core = store.getCore();
      // Pending tabs are selectable — a loading or locked tab is a real tab.
      if (core.documents[id] || core.pending[id]) setCore({ activeId: id });
    },
    getActiveId: () => store.getCore().activeId,
    getActive: () => getDocument(),
    list: listDocuments,
    get: getDocument,
    has: (id) => {
      const core = store.getCore();
      return core.documents[id] !== undefined || core.pending[id] !== undefined;
    },
    getCount: () => store.getCore().order.length,
    getOrder: () => store.getCore().order,
    setOrder: (ids) => {
      const current = store.getCore().order;
      const same =
        ids.length === current.length &&
        [...ids].sort().join('\0') === [...current].sort().join('\0');
      if (!same) {
        throw new PluginError(
          'invalid-input',
          'documents',
          'setOrder() needs a permutation of the current order',
        );
      }
      reorder([...ids]);
    },
    move: (id, toIndex) => {
      const core = store.getCore();
      if (!core.documents[id] && !core.pending[id]) return;
      const without = core.order.filter((documentId) => documentId !== id);
      const clamped = Math.max(0, Math.min(toIndex, without.length));
      without.splice(clamped, 0, id);
      reorder(without);
    },
    swap: (id, otherId) => {
      const core = store.getCore();
      const index = core.order.indexOf(id);
      const otherIndex = core.order.indexOf(otherId);
      if (index < 0 || otherIndex < 0) return;
      const next = [...core.order];
      next[index] = otherId;
      next[otherIndex] = id;
      reorder(next);
    },
    // Reading the file: download() and downloadLayer() (downloadFile above).
    download: (id, options) =>
      downloadFile(id, options?.signal, 'download', (handle) =>
        handle.download(options?.mode !== undefined ? { mode: options.mode } : undefined),
      ),
    downloadLayer: (id, options) =>
      downloadFile(
        id,
        options?.signal,
        'downloadLayer',
        (handle) => (isLocalDocument(handle) ? handle.downloadLayer() : Promise.reject(noLayer())),
        // Refused before anything runs: the cloud engine keeps layers itself.
        (handle) => (isLocalDocument(handle) ? null : noLayer()),
      ),
    // Printing it: the pages drawn by the print rules, on the host's printer (preparePrint above).
    preparePrint: (id, options) => preparePrint(id, options),
    async print(id, options = {}) {
      const prepared = await preparePrint(id, options);
      try {
        await prepared.print(options.signal ? { signal: options.signal } : undefined);
      } finally {
        prepared.dispose();
      }
    },
    getPrintQuality: (id) => printQualityOf(id),
    // The verbs that need them live here, so their checks do too (permissions.md).
    canDownload: (id) => allowsOn(id, 'doc.download'),
    canPrint: (id) => canPrintOn(id),
    // The page registry, addressed by PageRef (durable) or display index.
    listPages: (id) => metaOf(id)?.pages ?? EMPTY_PAGES,
    getPage: (page, id) => findPage(metaOf(id)?.pages ?? EMPTY_PAGES, page),
    getPageIndex: (ref, id) =>
      metaOf(id)?.pages.findIndex((pageInfo) => pageRefsEqual(pageInfo.ref, ref)) ?? -1,
    getRevision: (id) => metaOf(id)?.revision ?? -1,
    onOpened: opened.on,
    onOpenFailed: openFailed.on,
    onLocked: locked.on,
    onClosed: closed.on,
    onActiveChanged: activeChanged.on,
    onPagesChanged: pagesChanged.on,
    onUnsavedChangesChanged: unsavedChangesChanged.on,
  };
  workspaceCapabilities.set(DocumentsToken, documents);

  // ── workspace plugins: seed slices, then build their capabilities ────────────
  for (const plugin of plan.ordered) {
    if (!isDocumentScoped(plugin)) {
      workspaceLeases.set(plugin, store.lease(plugin.id, initialStateOf(plugin)));
    }
  }
  for (const plugin of plan.ordered) {
    if (isDocumentScoped(plugin)) continue;
    const ctx = createPluginContext(
      services,
      plugin,
      undefined,
      workspaceCancel.signal,
      workspaceScope,
    );
    const { api, connect } = plugin.create(ctx);
    if (plugin.token) workspaceCapabilities.set(plugin.token, api);
    workspaceConnectors.set(plugin, () => {
      connect?.();
      markConnected(ctx);
    });
  }

  return {
    ...viewerSettings.api,
    engine,
    documents,
    capability: resolveCapability,
    tryCapability: tryResolveCapability,
    scopeOf: plan.scopeOf,
    settingsOf,
    subscribe: store.subscribe,
    getState: store.getState,
    status: () => status,
    start: () => {
      if (status === 'destroying' || status === 'destroyed' || status === 'failed') {
        return Promise.reject(new Error(`[kernel] start() on a ${status} kernel`));
      }
      return (startPromise ??= (async () => {
        status = 'starting';
        try {
          for (const plugin of plan.ordered) {
            if (status !== 'starting') return; // destroy() raced us
            if (!isDocumentScoped(plugin)) workspaceConnectors.get(plugin)?.();
          }
          status = 'started';
        } catch (error) {
          // Startup failure unwinds everything construction + start registered;
          // the kernel is terminally failed (destroy() remains legal, and idle).
          status = 'failed';
          await workspaceScope.dispose();
          workspaceCapabilities.clear();
          throw error;
        }
      })());
    },
    destroy: () => {
      return (destroyPromise ??= (async () => {
        const wasFailed = status === 'failed';
        status = 'destroying'; // an in-flight start exits at its next check
        workspaceCancel.abort(new CancelledError('kernel destroyed'));
        await startPromise?.catch((error) => {
          if (!isCancelled(error) && !wasFailed) report(error);
        });
        // Close every session — the resource-owning map, not store.order: a
        // session mid-close is already unpublished but still needs joining.
        await Promise.allSettled([...sessions.values()].map((session) => session.close()));
        sessions.clear();
        await workspaceScope.dispose();
        workspaceCapabilities.clear();
        store.destroy();
        status = 'destroyed';
      })());
    },
  };
}
