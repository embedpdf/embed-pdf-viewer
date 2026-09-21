/**
 * @embedpdf/core — core contracts.
 *
 * Framework-free and serializable. The engine boundary is the REAL one:
 * `@embedpdf/engine-core`'s `Engine`/`DocumentHandle` — implemented identically by
 * local-wasm (`@embedpdf/engine`), cloud (`@cloudpdf/engine`), and the test fake.
 * The kernel adds *document scope*: plugins declare a scope and the kernel
 * multiplexes document-scoped plugins per document.
 */
import type { PageSpace } from '@embedpdf/core-geometry';
import type { EventHook } from './event-hook';
import type { PluginErrorInfo } from './errors';
import type {
  DocumentHandle,
  Engine,
  EngineFactory,
  OpenInput,
  OpenOptions,
  PageLayout,
  PageRef,
  PageObjectNumber,
  PageRotation,
  PageRotateResult,
  PageMoveResult,
  PageDeleteResult,
  PageInsertResult,
  PageInsertBlankSpec,
  PdfSize,
  DocCapability,
  PdfSaveMode,
  DocumentMetadata,
  MetadataPatch,
  MetadataUpdateResult,
  DocumentEvent,
  EngineRenderPolicy,
  PdfDestination,
} from '@embedpdf/engine-core/runtime';

// re-export the engine contracts so consumers import them from @embedpdf/core
export type {
  DocumentHandle,
  Engine,
  EngineFactory,
  OpenInput,
  OpenOptions,
  PageLayout,
  PdfDestination,
  PageObjectNumber,
  PageRotation,
  PageRotateResult,
  PageMoveResult,
  PageDeleteResult,
  PageInsertResult,
  PageInsertBlankSpec,
  PdfSize,
  DocCapability,
  PdfSaveMode,
  DocumentMetadata,
  MetadataPatch,
  MetadataUpdateResult,
  DocumentEvent,
};

export type Unsubscribe = () => void;

/** The last parameter of every method that does work: cooperative cancellation. */
export interface OperationOptions {
  readonly signal?: AbortSignal;
}

/** Load state of a resource a plugin hydrates from the engine. `forbidden` is a permission refusal, not an empty value. */
export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * The outcome of a best-effort batch (`renderPages`, `createMany`, …): what
 * was applied, what was skipped with a reason, and what failed with its
 * error summary. `R` is the input's identity (a `PageRef`, an `AnnotationRef`).
 */
export interface BatchResult<T, R = unknown> {
  readonly applied: readonly T[];
  readonly skipped: readonly { readonly ref: R; readonly reason: string }[];
  readonly failed: readonly { readonly ref: R; readonly error: PluginErrorInfo }[];
}

/**
 * Where a confirmed change came from, on every plugin event that reports one.
 * `locality` is whether THIS engine instance caused it; `trigger` is the
 * user-visible cause when known. Remote changes arrive with `trigger: 'unknown'`
 * because the transport does not carry it; never infer a gesture from it.
 */
export interface ChangeOrigin {
  readonly locality: 'local' | 'remote';
  readonly trigger: 'user' | 'api' | 'script' | 'system' | 'unknown';
  readonly sessionId: string | null;
  readonly actorId: string | null;
}

/** The origin of a confirmed engine event, projected onto the plugin vocabulary. */
export function originOf(event: {
  origin: { kind: 'local' | 'remote'; sessionId: string; sub: string | null };
}): ChangeOrigin {
  return {
    locality: event.origin.kind === 'remote' ? 'remote' : 'local',
    trigger: 'unknown',
    sessionId: event.origin.sessionId,
    actorId: event.origin.sub ?? null,
  };
}

/** Anything `ctx.listen` can subscribe to: an EventHook, or an object with `subscribe`. */
export type Subscribable<T> =
  | ((listener: (event: T) => void) => Unsubscribe)
  | { subscribe(listener: (event: T) => void): Unsubscribe };

/**
 * The public name of a page-registry entry: `ref` is the durable identity,
 * `index` the display order, plus label, size, rotation, userUnit and boxes.
 * Structurally the engine's `PageLayout`; named for what it is to a developer.
 */
export type PageInfo = PageLayout;

/** Every state transition is a plain, serializable action. */
export interface Action {
  readonly type: string;
}

/** Kernel-emitted document-lifecycle actions; plugins may react via `onAction`. */
export const CORE_DOCUMENT_ADDED = '@@core/document-added';
export const CORE_DOCUMENT_REMOVED = '@@core/document-removed';
export const CORE_ACTIVE_CHANGED = '@@core/active-changed';
export const CORE_ORDER_CHANGED = '@@core/order-changed';
/** A document's page registry was replaced by a mutation event (rotate/move/delete). */
export const CORE_DOCUMENT_PAGES_UPDATED = '@@core/document-pages-updated';
/** A tab slot was reserved: `open()` was called; the document is loading. */
export const CORE_DOCUMENT_OPENING = '@@core/document-opening';
/** The engine reports the document needs a password (`documents.unlock`). */
export const CORE_DOCUMENT_LOCKED = '@@core/document-locked';
/** The open failed; the tab stays with `status: 'error'` until closed. */
export const CORE_DOCUMENT_OPEN_FAILED = '@@core/document-open-failed';
/** A tab was renamed (`documents.rename`). */
export const CORE_DOCUMENT_RENAMED = '@@core/document-renamed';

/** A typed handle to a capability — typed resolution, no string casts. */
export interface CapabilityToken<T> {
  readonly name: string;
  /**
   * Authored remedy shown when a plugin `requires` this capability and no
   * plugin provides it — the missing-dependency error should contain its own
   * fix (e.g. "add interactionPlugin() from '@embedpdf/plugin-interaction' to
   * your plugins list").
   */
  readonly hint?: string;
  /** phantom — never present at runtime */
  readonly __type?: T;
}

/**
 * What the kernel knows about an open document — the page registry captured at open.
 * `pages` is the engine's own snapshot (`PageLayout`: index, ref, size,
 * rotation, label, boxes). `ref` (the page's `PageRef`) is the durable
 * per-page identity; the array index is only display order.
 */
export interface DocumentMeta {
  readonly id: string;
  /**
   * Unique per OPEN of this id: closing and reopening the same document id
   * yields a new instanceId. Events, refs and leases are checked against it,
   * so nothing produced by a closed instance can be mistaken for the new one.
   */
  readonly instanceId: string;
  readonly name?: string;
  readonly pageCount: number;
  readonly pages: readonly PageLayout[];
  /**
   * Bumps every time the page registry is replaced by a document mutation
   * event (rotate/move/delete). The registry's monotonic version: anything
   * caching a derivation of `pages` (e.g. the Stage's laid-out scene) keys
   * on it so a same-`pageCount` change — like a rotation — still invalidates.
   */
  readonly revision: number;
  /**
   * The deployment render policy the document's engine advertises — a
   * document FACT like `pages`, materialized by the kernel at open (before
   * publish), NOT plugin state. One lifecycle (here), one interpretation
   * (engine-core's pure `snap*` helpers); any plugin reads it. Engines
   * without a render service — and failed policy reads — resolve to
   * `continuous`, so consumers never branch on absence. Naming rule: the
   * domain appears exactly once — bare `policy()` on the render SERVICE,
   * `renderPolicy` on flat envelopes like this one and `/v1/access`.
   */
  readonly renderPolicy: EngineRenderPolicy;
}

/**
 * A tab slot whose document is not (yet) real: still opening, waiting for a
 * password, or failed. Lives beside `documents`, never inside it — plugins
 * only ever see READY documents; pending slots are pure registry/UI state.
 * Request-time lifecycle: `open()` reserves the slot (id, order position,
 * activation) synchronously; only the content arrives at completion time.
 */
export interface PendingMeta {
  readonly id: string;
  readonly name?: string;
  readonly status: 'loading' | 'locked' | 'error';
  /** `locked` only: a password was supplied at open and rejected — the
   *  prompt should show its "incorrect password" copy, not "required". */
  readonly passwordProvided?: boolean;
  /** `error` only: what the open rejected with. Never carries a password. */
  readonly error?: unknown;
}

/** The document registry — what document scope is built on. */
export interface CoreState {
  readonly documents: Readonly<Record<string, DocumentMeta>>;
  readonly pending: Readonly<Record<string, PendingMeta>>;
  /** THE tab strip: spans ready docs and pending slots, in request order. */
  readonly order: readonly string[];
  /** May point at a pending slot (a loading or locked tab can be selected). */
  readonly activeId: string | null;
}

export interface GlobalState {
  readonly core: CoreState;
  readonly plugins: Readonly<Record<string, unknown>>;
}

export type PluginScope = 'workspace' | 'document';

/**
 * The context a plugin receives. Document-scoped plugins get a context bound to a
 * single document — `documentId`, `document()` (metadata), `doc` (the engine handle),
 * and `get()` resolving document-scoped capabilities for it.
 */
export interface PluginContext<S, A extends Action = Action> {
  readonly id: string;
  readonly engine: Engine;
  /** The bound document (document-scoped plugins only; undefined for workspace). */
  readonly documentId?: string;
  /** The bound document's engine handle; for workspace plugins, the active doc's handle, or null. */
  readonly doc: DocumentHandle | null;
  /** Resolve a live engine handle by document id; omitted follows this context's normal active/bound rule. */
  documentHandle(documentId?: string): DocumentHandle | null;
  getState(): S;
  dispatch(action: A): void;
  subscribe(listener: () => void): Unsubscribe;
  core(): CoreState;
  /** The bound document's metadata; for workspace plugins, the active doc's, or null. */
  document(): DocumentMeta | null;
  get<T>(token: CapabilityToken<T>): T;
  forDocument<T>(token: CapabilityToken<T>, documentId: string): T;
  tryGet<T>(token: CapabilityToken<T>): T | null;
  /** `forDocument` for an OPTIONAL dependency: null when the plugin is not
   *  installed or that document is not ready, never a throw. */
  tryForDocument<T>(token: CapabilityToken<T>, documentId: string): T | null;
  /**
   * Register a resource teardown owned by this plugin instance. Document-
   * scoped callbacks run when that document closes; workspace callbacks run
   * when the kernel is destroyed. Asynchronous teardowns are awaited.
   * Registering after the owner is already disposed runs the teardown
   * immediately instead of dropping it — a late registration cannot leak.
   * Safe for capability-held timers, runtimes, subscriptions, object URLs,
   * and binary caches.
   */
  cleanup(fn: () => void | Promise<void>): void;
}

/** Side-effect context: the only place async/IO/cross-plugin reactions live. */
export interface EffectContext<S, A extends Action = Action> extends PluginContext<S, A> {
  watch<R>(
    select: () => R,
    handler: (value: R, previous: R) => void,
    isEqual?: (a: R, b: R) => boolean,
  ): Unsubscribe;
  onAction(type: string, handler: (action: Action) => void): Unsubscribe;
}

/**
 * The context a plugin's `create()` receives. The plain context plus nine
 * members, each explainable in one sentence at the call site; the lifetime
 * and error guarantees live inside them, so a controller is plain async code.
 */
export interface ControllerContext<S, A extends Action = Action> extends PluginContext<S, A> {
  /** Unique per open of this document (workspace plugins: `workspace:<id>`). */
  readonly instanceId: string;
  /**
   * GUARDED document handle: every call rejects `instance-closed` once the
   * instance closed, is aborted at close, and throws `PluginError` instead of
   * raw engine errors. Workspace plugins have no bound document and must use
   * `forDocument()`; reading `doc` there throws.
   */
  readonly doc: DocumentHandle;
  /** Mint a capability event; disposed with the instance. Expose only `.on`. */
  readonly events: {
    source<T>(): { readonly on: EventHook<T>; emit(event: T): void; dispose(): void };
  };
  /** The one owner of page ↔ PDF conversion for a page of THIS document. */
  /** Page ↔ PDF conversion for a page of this document, cached per registry
   *  revision. `forPage` throws `not-found` for a foreign ref; `tryForPage`
   *  answers null (reads that tolerate a page not laid out yet). */
  readonly geometry: {
    forPage(ref: PageRef): PageSpace;
    tryForPage(ref: PageRef): PageSpace | null;
  };
  /** Subscribe for the instance lifetime; the unsubscribe is owned by the kernel. */
  listen<T>(source: Subscribable<T>, listener: (event: T) => void): void;
  /** Resolve when the predicate holds (checked on every store change); rejects on cancel or close. */
  waitFor(predicate: () => boolean, options?: OperationOptions): Promise<void>;
  /** Per-key submission-order queue for multi-step writes; failures do not poison later work. */
  serialQueue(key?: string): <T>(operation: () => Promise<T>) => Promise<T>;
  /** Newest-wins lane for reads a newer call should cancel (visible search, validation). */
  latest(key: string): import('./lanes').LatestLane;
  /** Acquire a resource whose disposal the instance owns; a late arrival after close is disposed, not returned. */
  acquire<R>(
    get: (lifetime: AbortSignal) => Promise<R>,
    dispose: (resource: R) => void | Promise<void>,
  ): Promise<R>;
  /** Throw `not-found` unless the ref names a page of THIS document. */
  assertPageRef(ref: PageRef): void;
  /** The page registry entry for a ref, or null. */
  getPage(ref: PageRef): PageInfo | null;
}

/**
 * A plugin definition. `scope` decides multiplexing:
 *   'workspace' (default) — one instance; can see every document.
 *   'document'            — one instance PER open document; authored single-document.
 */
export interface PluginDef<S = unknown, A extends Action = Action, C = unknown> {
  readonly id: string;
  readonly token?: CapabilityToken<C>;
  readonly scope?: PluginScope;
  readonly requires?: ReadonlyArray<CapabilityToken<unknown>>;
  readonly optional?: ReadonlyArray<CapabilityToken<unknown>>;
  readonly initialState?: S | (() => S);
  readonly reduce?: (state: S, action: A) => S;
  readonly capability?: (ctx: PluginContext<S, A>) => C;
  readonly init?: (ctx: PluginContext<S, A>) => void | Promise<void>;
  readonly effects?: (ctx: EffectContext<S, A>) => void;
  /**
   * The controller hook: build the instance's API and, optionally, the
   * connections (subscriptions to engine events and sibling capabilities)
   * that start once every dependency is constructed. Runs once per INSTANCE.
   * A plugin declares either `create` or `capability`/`effects`, not both.
   */
  readonly create?: (ctx: ControllerContext<S, A>) => { api: C; connect?: () => void };
}

export type AnyPlugin = PluginDef<any, any, any>;

// ── Built-in: the document registry, exposed as a capability ─────────────────

export type DocStatus = 'loading' | 'locked' | 'ready' | 'error';

export interface DocInfo {
  id: string;
  name?: string;
  /** Lifecycle state — the tab bar renders directly off this. */
  status: DocStatus;
  /** 0 until the document is `ready`. */
  pageCount: number;
  /** `locked` only: a supplied password was rejected (show "incorrect"). */
  passwordProvided?: boolean;
  /** `error` only: why the open failed, in the plugin error vocabulary. */
  error?: PluginErrorInfo;
}

/** Field-wise DocInfo equality — the ONE definition every adapter's reactive
 *  `docs` read keys on, so a new lifecycle field can never silently stop
 *  re-rendering one framework's tab bar. */
export const docInfoEquals = (a: DocInfo, b: DocInfo): boolean =>
  a.id === b.id &&
  a.name === b.name &&
  a.status === b.status &&
  a.pageCount === b.pageCount &&
  a.passwordProvided === b.passwordProvided &&
  a.error?.code === b.error?.code &&
  a.error?.message === b.error?.message;

export const docInfoListEquals = (a: readonly DocInfo[], b: readonly DocInfo[]): boolean =>
  a === b || (a.length === b.length && a.every((d, i) => docInfoEquals(d, b[i])));

/** Options for opening a document: kernel concerns (activate/name) + engine OpenOptions. */
export type OpenDocumentOptions = OpenOptions & { activate?: boolean; name?: string };

/**
 * What `open()` accepts: an engine `OpenInput`, or a thunk producing one.
 * The thunk form makes the FETCH happen under the loading tab — the slot is
 * reserved synchronously, then the thunk runs (network), then the engine
 * opens. Prefer it for anything that isn't already in memory.
 *
 * The thunk receives an AbortSignal that fires if the tab is closed while
 * the fetch is still running — pass it to `fetch()` so a closed tab stops
 * the network work. Zero-argument thunks keep working unchanged.
 */
export type OpenSource = OpenInput | ((signal: AbortSignal) => OpenInput | Promise<OpenInput>);

/**
 * One boot document for `documents.openAll()` — THE shared shape every
 * framework adapter's `initialDocuments` input uses (adapters re-export it,
 * never redefine it). `active` picks the selected tab (default: the first);
 * all other open options (name, password, scope, identity, …) pass straight
 * through to `open()`, so the declarative and imperative paths cannot drift.
 */
export type InitialDocument = { source: OpenSource; active?: boolean } & Omit<
  OpenDocumentOptions,
  'activate'
>;

// ── document lifecycle events ─────────────────────────────────────────────
export interface DocumentOpenedEvent {
  readonly documentId: string;
  readonly info: DocInfo;
}
export interface DocumentOpenFailedEvent {
  readonly documentId: string;
  readonly error: PluginErrorInfo;
}
export interface DocumentLockedEvent {
  readonly documentId: string;
  readonly passwordProvided: boolean;
}
export interface DocumentClosedEvent {
  readonly documentId: string;
}
export interface ActiveDocumentChangedEvent {
  readonly documentId: string | null;
  readonly previousDocumentId: string | null;
}
export interface DocumentPagesChangedEvent {
  readonly documentId: string;
  readonly revision: number;
  readonly pages: readonly PageInfo[];
}

export interface DocumentsCapability {
  /** Open a document; the tab exists synchronously, content arrives on resolve. */
  open(input: OpenSource, options?: OpenDocumentOptions): Promise<string>;
  /** Re-run a failed open (`status: 'error'`) with the same source and options. */
  retry(id: string): Promise<string>;
  /** Change the tab name. */
  rename(id: string, name: string): void;
  /**
   * Boot-open a batch: fires every `open()` WITHOUT awaiting, so each tab
   * slot is reserved synchronously — all tabs exist immediately, in array
   * order — and exactly ONE is selected (the `active` entry, else the
   * first), decided at request time so a slow document can never steal
   * focus. Failures surface as the tab's `error`/`locked` status, never as
   * unhandled rejections. This is kernel-owned POLICY: adapters call this
   * one line instead of each re-implementing activation and error handling.
   */
  openAll(docs: readonly InitialDocument[]): readonly string[];
  /**
   * Unlock a `locked` document with a password and promote it to `ready`.
   * Rejects with the engine's DocPasswordIncorrect on a wrong password —
   * the document stays locked and unlock can be called again. Identical
   * behavior on the local (worker loads the parked bytes) and cloud
   * (/access grant) engines.
   */
  unlock(id: string, input: { password: string }): Promise<void>;
  close(id: string): Promise<void>;
  closeAll(): Promise<void>;
  setActive(id: string): void;
  /** The selected tab's id. */
  getActiveId(): string | null;
  /** The selected tab's info. */
  getActive(): DocInfo | null;
  /** Every tab in order (ready documents and pending slots), reference-stable until it changes. */
  list(): readonly DocInfo[];
  get(id: string): DocInfo | null;
  has(id: string): boolean;
  getCount(): number;
  getOrder(): readonly string[];
  /** Reorder every tab at once; `ids` must be a permutation of the current order. */
  setOrder(ids: readonly string[]): void;
  /** Move a document (tab) to a new position in the order. */
  move(id: string, toIndex: number): void;
  /** Swap two documents (tabs) in the order. */
  swap(a: string, b: string): void;
  /**
   * The COMPLETE document (base + layer) as PDF bytes. `mode` is
   * `'incremental'` (append changes, original bytes preserved) or `'rewrite'`
   * (flatten to a fresh PDF). Defaults to the active document. Saving to
   * disk is a web adapter verb (`saveAs`), not a kernel one.
   */
  save(id?: string, options?: { mode?: PdfSaveMode } & OperationOptions): Promise<Uint8Array>;
  /**
   * Export JUST the document's LAYER artifact (re-openable via `OpenInputLayerBytes`).
   * Rejects when the document was opened without a layer, or the engine can't
   * export one (cloud manages layers server-side — `DocumentHandle.downloadLayer`
   * is absent there). Defaults to the active document.
   */
  saveLayer(id?: string, options?: OperationOptions): Promise<Uint8Array>;
  /**
   * The page registry of a document (the active one by default), in display
   * order. Reference-stable per registry revision: the array only changes
   * when a structural mutation replaced it.
   */
  listPages(documentId?: string): readonly PageInfo[];
  /** One page by its durable `PageRef`, or null when unknown to THAT document. */
  getPage(ref: PageRef, documentId?: string): PageInfo | null;
  /** One page by zero-based display index. */
  getPageAt(index: number, documentId?: string): PageInfo | null;
  /** Display index of a page, `-1` when the document does not have it. */
  getPageIndex(ref: PageRef, documentId?: string): number;
  /** The registry revision (bumps on rotate/move/delete/insert); `-1` with no document. */
  getRevision(documentId?: string): number;
  /**
   * Session authority over a document — the sanctioned surface for the ONE
   * chrome exception in permissions.md: kernel-level features with a 1:1
   * capability and no owning plugin (print via `'doc.print'`, download via
   * `'doc.download'` — the verbs live on THIS capability). Everything else
   * asks the owning plugin's twins, never a raw capability string. Defaults
   * to the active document; `false` with no (ready) document.
   */
  allows(cap: DocCapability, id?: string): boolean;

  /** A document became `ready`. */
  readonly onOpened: EventHook<DocumentOpenedEvent>;
  /** An open failed; the tab shows `error`. */
  readonly onOpenFailed: EventHook<DocumentOpenFailedEvent>;
  /** A document parked on a password. */
  readonly onLocked: EventHook<DocumentLockedEvent>;
  /** A document was closed, after its resources were released. */
  readonly onClosed: EventHook<DocumentClosedEvent>;
  /** The selected tab changed. */
  readonly onActiveChanged: EventHook<ActiveDocumentChangedEvent>;
  /** The page registry was replaced (rotate, move, delete, insert). */
  readonly onPagesChanged: EventHook<DocumentPagesChangedEvent>;
}

/** Built-in token for the document registry capability (provided by the kernel). */
export const DocumentsToken: CapabilityToken<DocumentsCapability> = { name: 'documents' };
