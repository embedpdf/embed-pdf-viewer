/**
 * @embedpdf/core — core contracts.
 *
 * Framework-free and serializable. The engine boundary is the real one:
 * `@embedpdf/engine-core`'s `Engine`/`DocumentHandle` — implemented identically by
 * local-wasm (`@embedpdf/engine`), cloud (`@cloudpdf/engine`), and the test fake.
 * The kernel adds *document scope*: plugins declare a scope and the kernel
 * multiplexes document-scoped plugins per document.
 */
import type { EventHook } from './event-hook';
import type { Mirror, MirrorSpec } from './mirror';
import type { PageMirror, PageMirrorSpec } from './page-mirror';
import type { SerialQueue } from './serial-queue';
import type { NoSettings, Settings, SettingsDeclaration } from './settings';
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
  PdfRotation,
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
  CustomMetadata,
  CustomMetadataPatch,
  CustomMetadataUpdateResult,
  DocumentEvent,
  EventOrigin,
  EngineRenderPolicy,
  PageDestination,
  PdfDestination,
  Identity,
} from '@embedpdf/engine-core/runtime';

// re-export the engine contracts so consumers import them from @embedpdf/core
export type {
  DocumentHandle,
  Engine,
  EngineFactory,
  OpenInput,
  OpenOptions,
  PageLayout,
  PageDestination,
  PdfDestination,
  PageObjectNumber,
  PdfRotation,
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
  CustomMetadata,
  CustomMetadataPatch,
  CustomMetadataUpdateResult,
  DocumentEvent,
  /** Who the user is: the author of what they make, and whom `:self` and `:group` permissions are checked against. */
  Identity,
  /**
   * Where a confirmed document change came from, on every fact event a plugin
   * emits: `kind` (`'local'` for this engine instance, `'remote'` for another
   * session), `sessionId`, `sub` (the signed-in user on the cloud, null
   * locally), `ts`, `serverId` and `tx`. Always the engine event's own
   * `origin`, passed on as it is, never built by hand.
   */
  EventOrigin,
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
 * A permission a verb can need, named as the engine names it: a document
 * capability (`'doc.forms.fill'`), or `'annotations:create'`. Creating is the
 * one annotation action that needs no target: whether the session may change
 * or delete an annotation depends on whose it is, so the annotation plugin
 * asks that per annotation (`doc.security.allowsAnnotation`).
 */
export type Permission = DocCapability | 'annotations:create';

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
   * Unique per open of this id: closing and reopening the same document id
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
   * document fact like `pages`, materialized by the kernel at open (before
   * publish), not plugin state. One lifecycle (here), one interpretation
   * (engine-core's pure `snap*` helpers); any plugin reads it. Engines
   * without a render service — and failed policy reads — resolve to
   * `continuous`, so consumers never branch on absence. Naming rule: the
   * domain appears exactly once — bare `policy()` on the render service,
   * `renderPolicy` on flat envelopes like this one and `/v1/access`.
   */
  readonly renderPolicy: EngineRenderPolicy;
  /**
   * Whether the document changed since it was opened or last downloaded. Only an engine whose
   * changes live in this tab sets it (the local engine); the cloud engine stores every change
   * as it's made.
   */
  readonly hasUnsavedChanges: boolean;
}

/**
 * A tab slot whose document is not (yet) real: still opening, waiting for a
 * password, or failed. Lives beside `documents`, never inside it — plugins
 * only ever see ready documents; pending slots are pure registry/UI state.
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
  /** The tab strip: spans ready docs and pending slots, in request order. */
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
 * The context a plugin's `create()` receives. Document-scoped plugins get a
 * context bound to one document; workspace plugins reach documents through
 * `forDocument`. Everything here is bound to the instance's lifetime, so a
 * controller written as plain async code is lifetime-safe by construction.
 * `S` is the plugin's session state and `T` its settings, `NoSettings` for a
 * plugin that declares none.
 */
export interface PluginContext<S = unknown, T extends object = NoSettings> {
  // ── identity ──
  readonly id: string;
  /** Unique per open of this document (workspace plugins: `workspace:<id>`). */
  readonly instanceId: string;
  /** The bound document (document-scoped plugins only; undefined for workspace). */
  readonly documentId?: string;

  // ── the document ──
  readonly engine: Engine;
  /**
   * The guarded document handle: every call rejects `instance-closed` once the
   * instance closed, is aborted at close, and throws `PluginError` instead of
   * raw engine errors. Workspace plugins have no bound document and must use
   * `forDocument()`; reading `doc` there throws.
   */
  readonly doc: DocumentHandle;
  /** Resolve a live engine handle by document id; omitted follows this context's normal active/bound rule. */
  documentHandle(documentId?: string): DocumentHandle | null;
  /** The bound document's metadata; for workspace plugins, the active document's, or null. */
  document(): DocumentMeta | null;
  /**
   * The page a `PageRef` or a zero-based index names, or null when it names
   * no page of this document. What reads use: they run while rendering, and a
   * page deleted mid-render reads as no page instead of breaking a layer.
   */
  getPage(page: PageRef | number): PageInfo | null;
  /**
   * A page argument as every verb takes it: a `PageRef`, or a zero-based
   * index into the document's page list. Throws `not-found` when neither
   * names a page of this document: a verb refuses a page that isn't there.
   */
  pageOf(page: PageRef | number): PageInfo;
  /** Throw `not-found` unless the ref names a page of this document. */
  assertPageRef(ref: PageRef): void;

  // ── permissions ──
  /**
   * Whether the bound document's session holds `permission`: the same answer
   * the engine enforces with. What every `can<Verb>()` reads.
   * Document-scoped plugins only: a workspace context has no bound document,
   * so this throws as reading `doc` does. A workspace plugin asks the `can<Verb>()` of the
   * document plugin it acts through (`ctx.forDocument(token, documentId)`).
   */
  allows(permission: Permission): boolean;
  /**
   * Refuse a verb the session may not run, before any engine call: throws
   * `permission-denied` ("`operation` requires `permission`") with
   * `error.permission` set. Document-scoped plugins only, like `allows`.
   */
  assertAllowed(permission: Permission, operation: string): void;

  // ── capabilities ──
  get<T>(token: CapabilityToken<T>): T;
  tryGet<T>(token: CapabilityToken<T>): T | null;
  forDocument<T>(token: CapabilityToken<T>, documentId: string): T;
  /** `forDocument` for an optional dependency: null when the plugin is not
   *  installed or that document is not ready, never a throw. */
  tryForDocument<T>(token: CapabilityToken<T>, documentId: string): T | null;

  // ── state ──
  /** This instance's session state, changed only through pure transitions. */
  readonly state: StateCell<S>;

  // ── settings ──
  /**
   * The plugin's settings, as its definition declares them (`definePlugin({ settings })`):
   * what the app registered over the defaults. They belong to the plugin as registered, not to
   * this instance: the kernel builds them when it plans the plugin list, before any document
   * opens, and `updateSettings()` reaches every open document and the ones opened later. Spread
   * `api` into the capability and read `get()` in the controller; the instance's
   * `onSettingsChanged` listeners go when it closes. The merge rules are in `settings.ts`.
   * A plugin whose definition declares no settings has none to read: calling it throws.
   */
  readonly settings: () => Settings<T>;

  // ── reactivity ──
  /**
   * Wake every reader: something this capability reads outside its state
   * (a registry, a cache, a resource) changed. A no-op once the instance closed.
   */
  notify(): void;
  /**
   * Run `handler` whenever `select()` answers differently. For reacting to
   * state this plugin does not own (the page registry, a sibling's getter);
   * this plugin's own changes are observed with `state.onChange`.
   * Unsubscribed when the instance closes.
   */
  watch<R>(
    select: () => R,
    handler: (value: R, previous: R) => void,
    isEqual?: (left: R, right: R) => boolean,
  ): Unsubscribe;
  /** Resolve when the predicate holds (checked on every store change); rejects on cancel or close. */
  waitFor(predicate: () => boolean, options?: OperationOptions): Promise<void>;

  // ── engine truth ──
  /**
   * A local copy of document data the engine owns, kept current from confirmed
   * document events (every origin) and reloads. Document-scoped plugins only;
   * loading starts once the plugin is connected.
   */
  mirror<V>(spec: MirrorSpec<V>): Mirror<V>;
  /** Like `mirror`, for data loaded page by page on demand. */
  pageMirror<V>(spec: PageMirrorSpec<V>): PageMirror<V>;

  // ── events ──
  /** Mint a capability event; disposed with the instance. Expose only `.on`. */
  readonly events: {
    source<T>(): { readonly on: EventHook<T>; emit(event: T): void; dispose(): void };
  };
  /** Subscribe for the instance lifetime; the unsubscribe is owned by the kernel. */
  listen<T>(source: Subscribable<T>, listener: (event: T) => void): void;

  // ── lifetime and async ──
  /**
   * Register a resource teardown owned by this plugin instance. Document-
   * scoped callbacks run when that document closes; workspace callbacks run
   * when the kernel is destroyed. Asynchronous teardowns are awaited.
   * Registering after the owner is already disposed runs the teardown
   * immediately instead of dropping it, so a late registration cannot leak.
   */
  cleanup(fn: () => void | Promise<void>): void;
  /**
   * Register what this plugin holds back from the engine, such as text typed a moment ago or
   * the writes in its write queue (`() => queue.idle()`). Before anything reads the whole
   * document (`documents.download()`, `downloadLayer()`), the kernel calls every plugin's `flush` and
   * waits for it: send what's held back, and resolve once the engine has it. Document-scoped
   * plugins only; unregistered when the instance closes. The rules are in
   * `docs/conventions/state-and-sync.md`.
   */
  onSettle(flush: (signal: AbortSignal) => Promise<void> | void): void;
  /**
   * Run something of the document's own around every download of its file
   * (`documents.download()`, `downloadLayer()`): `wrap` gets the read and returns its bytes,
   * doing what comes before and after it. The actions plugin runs the document's save actions
   * this way. The document has settled before `wrap` is called; the first registered wraps the
   * others. Document-scoped plugins only; unregistered when the instance closes.
   */
  aroundDownload(wrap: (read: () => Promise<Uint8Array>) => Promise<Uint8Array>): void;
  /** Acquire a resource whose disposal the instance owns; a late arrival after close is disposed, not returned. */
  acquire<R>(
    get: (lifetime: AbortSignal) => Promise<R>,
    dispose: (resource: R) => void | Promise<void>,
  ): Promise<R>;
  /**
   * Run an engine call the caller can cancel: when `signal` fires, the call is
   * aborted (if the engine can abort it) and the returned promise rejects
   * `operation-cancelled` at once. A signal that already fired rejects
   * straight away; without a signal, `task` is returned as it is.
   */
  cancellable<T>(signal: AbortSignal | undefined, task: Promise<T>): Promise<T>;
  /** Newest-wins lane for reads a newer call should cancel (visible search, validation). */
  latest(key: string): import('./lanes').LatestLane;
  /**
   * Per-key submission-order queue for multi-step writes; failures do not
   * poison later work. An operation queued with `{ signal }` whose signal
   * fired while it waited is skipped and rejects `operation-cancelled`.
   */
  serialQueue(key?: string): SerialQueue;
}

/**
 * A plugin instance's session state. The value is replaced, never mutated:
 * `update` applies a pure transition, and a transition that returns the
 * current value changes nothing.
 */
export interface StateCell<S> {
  get(): S;
  update<Args extends unknown[]>(transition: (state: S, ...args: Args) => S, ...args: Args): void;
  /** Fires synchronously after every committed change of this instance's state. */
  readonly onChange: EventHook<StateChange<S>>;
}

/** One committed state change: the value before and after. */
export interface StateChange<S> {
  readonly next: S;
  readonly previous: S;
}

/**
 * A plugin definition. `scope` decides multiplexing:
 *   'workspace' (default) — one instance; can see every document.
 *   'document'            — one instance per open document; authored single-document.
 *
 * Its types come from its own fields: the state `S` from `state`, the capability
 * `C` from `token`, the settings `T` from `settings.defaults`. `create` and
 * `inScope` are checked against them and never name them (`NoInfer`), so a
 * controller that returns less than the capability is a type error, not a
 * narrower capability.
 */
export interface PluginDef<S = unknown, C = unknown, T extends object = NoSettings> {
  readonly id: string;
  readonly token?: CapabilityToken<C>;
  readonly scope?: PluginScope;
  readonly requires?: ReadonlyArray<CapabilityToken<unknown>>;
  readonly optional?: ReadonlyArray<CapabilityToken<unknown>>;
  /**
   * The plugin resolves capabilities for code the host supplies (the commands
   * plugin runs command definitions that act on any capability), so it cannot
   * declare them. Resolving an undeclared token is then allowed; the kernel
   * neither orders nor validates those dependencies.
   */
  readonly resolvesAnyCapability?: true;
  /** Initial session state, built fresh for every instance. Omit for stateless plugins. */
  readonly state?: () => S;
  /**
   * The plugin's settings: its defaults, and what the app registered (the factory's config).
   * The kernel builds one store per registration from it when it plans the plugin list, so the
   * settings can be read and changed before any document opens (`kernel.settingsOf(token)`).
   * The plugin reads them with `ctx.settings()`. Omit for a plugin without settings.
   */
  readonly settings?: SettingsDeclaration<T>;
  /**
   * Build the instance's API and, optionally, the connections (subscriptions
   * to engine events and sibling capabilities) that start once every
   * dependency is constructed. Runs once per instance.
   */
  readonly create: NoInfer<(ctx: PluginContext<S, T>) => { api: C; connect?: () => void }>;
  /**
   * This capability as seen from inside a document's scope: calls that leave out the document
   * use `documentId` instead of the active one. Workspace plugins only. The kernel builds the
   * view once per document and hands it out whenever that document is named
   * (`kernel.capability(token, documentId)`, `ctx.forDocument`, a `<DocumentScope>`).
   */
  readonly inScope?: NoInfer<(api: C, documentId: string) => C>;
}

export type AnyPlugin = PluginDef<any, any, any>;

// ── Built-in: the document registry, exposed as a capability ─────────────────

/** Where a document is: opening, waiting for its password, open, or failed to open. */
export type DocumentStatus = 'loading' | 'locked' | 'ready' | 'error';

/**
 * An open document, as its tab shows it. The same object until one of its fields changes, so a
 * reader that compares by reference re-renders only for its own document.
 */
export interface DocumentInfo {
  /** The document's id, for `close(id)`, `unlock(id, …)` and a document scope. */
  readonly id: string;
  /** The name its tab shows, from `open()` or `rename()`. */
  readonly name?: string;
  readonly status: DocumentStatus;
  /** How many pages it has; 0 until it's `ready`. */
  readonly pageCount: number;
  /**
   * Whether it has changes that weren't downloaded yet. Always false on an engine that stores
   * every change as it's made (the cloud engine).
   */
  readonly hasUnsavedChanges: boolean;
  /** `locked` only: a password was tried and was wrong. */
  readonly passwordProvided?: boolean;
  /** `error` only: why it couldn't be opened, in the plugin error vocabulary. */
  readonly error?: PluginErrorInfo;
}

/** A document waiting for its password. */
export interface LockedDocumentInfo extends DocumentInfo {
  readonly status: 'locked';
  readonly passwordProvided: boolean;
}

/** A document that couldn't be opened, and why. */
export interface FailedDocumentInfo extends DocumentInfo {
  readonly status: 'error';
  readonly error: PluginErrorInfo;
}

/** A file the viewer downloads itself, with the document's cancel signal: relative to the page, or absolute. */
export interface UrlSource {
  readonly kind: 'url';
  readonly url: string;
}

/** Options for opening a document: the tab (`name`, `activate`), the engine's `OpenOptions`, and a `signal`. */
export type OpenDocumentOptions = OpenOptions & {
  /** Make it the active document; true unless given. */
  readonly activate?: boolean;
  /** The name its tab shows. */
  readonly name?: string;
  /** Cancels the open: the document closes, and `open()` rejects `operation-cancelled`. */
  readonly signal?: AbortSignal;
};

/**
 * What `open()` accepts: an engine `OpenInput`, a URL the viewer downloads, or a function that
 * returns one of them. A function runs under the document's loading state, so the tab exists
 * while it fetches; the `signal` it receives fires when the document is closed first, so pass it
 * to `fetch()`.
 */
export type OpenSource =
  | OpenInput
  | UrlSource
  | ((signal: AbortSignal) => OpenInput | UrlSource | Promise<OpenInput | UrlSource>);

/** What `open()` and `retry()` resolve: the document, ready or locked. */
export interface OpenDocumentResult {
  readonly document: DocumentInfo;
}

/** Options for `unlock()`: the password, and a `signal` that stops trying it. */
export interface UnlockOptions extends OperationOptions {
  readonly password: string;
}

/** Options for `download()`. */
export interface DownloadOptions extends OperationOptions {
  /**
   * `'incremental'` (the default) appends the changes to the original file, so existing
   * signatures stay valid; `'rewrite'` writes a fresh file without earlier revisions.
   */
  readonly mode?: PdfSaveMode;
}

/**
 * One boot document for `documents.openAll()` — the shared shape every
 * framework adapter's `initialDocuments` input uses (adapters re-export it,
 * never redefine it). `active` picks the selected tab (default: the first);
 * all other open options (name, password, scope, identity, …) pass straight
 * through to `open()`, so the declarative and imperative paths cannot drift.
 */
export type InitialDocument = { source: OpenSource; active?: boolean } & Omit<
  OpenDocumentOptions,
  'activate' | 'signal'
>;

// ── document lifecycle events ─────────────────────────────────────────────
export interface DocumentOpenedEvent {
  readonly documentId: string;
  readonly info: DocumentInfo;
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
export interface DocumentActiveChangedEvent {
  readonly documentId: string | null;
  readonly previousDocumentId: string | null;
}
export interface DocumentPagesChangedEvent {
  readonly documentId: string;
  readonly revision: number;
  readonly pages: readonly PageInfo[];
}
export interface DocumentUnsavedChangesChangedEvent {
  readonly documentId: string;
  readonly hasUnsavedChanges: boolean;
}

/**
 * The document registry. A call that leaves out the document uses the document in scope when
 * the capability was resolved for one (`kernel.capability(DocumentsToken, documentId)`, a
 * `<DocumentScope>`), and the active document otherwise. Its verbs reject with `PluginError`.
 */
export interface DocumentsCapability {
  /**
   * Open a document and make it the active one (unless `activate: false`). Its tab exists at
   * once; the promise resolves `{ document }` once it's ready, or locked with a password.
   * The document's own `scope` and `identity` replace the viewer's. Rejects with the reason it
   * couldn't be opened (the tab then shows `error`), or `operation-cancelled` when it was closed
   * or `signal` fired first.
   */
  open(source: OpenSource, options?: OpenDocumentOptions): Promise<OpenDocumentResult>;
  /**
   * Open a failed document (`status: 'error'`) again, with the same source and options.
   * Resolves like `open()`. Rejects `invalid-input` for a document that didn't fail.
   */
  retry(id: string, options?: OperationOptions): Promise<OpenDocumentResult>;
  /** Change the name its tab shows; the file doesn't change. */
  rename(id: string, name: string): void;
  /**
   * Open several documents, as `initialDocuments` does: every tab appears at once, in array
   * order, and the one marked `active` (else the first) becomes the active one, decided now, so
   * a slow document never steals the focus. A failure shows in that document's `status`
   * instead of rejecting. Returns the tabs' ids.
   */
  openAll(documents: readonly InitialDocument[]): readonly string[];
  /**
   * Unlock a `locked` document with its password; it opens as it would have. Rejects
   * `permission-denied` on a wrong password, and the document stays locked so you can ask
   * again; `invalid-input` for a document that isn't locked.
   */
  unlock(id: string, options: UnlockOptions): Promise<void>;
  /** Close a document and free its memory; the next one becomes active. Closing one still opening cancels it. */
  close(id: string): Promise<void>;
  /** Close every document. */
  closeAll(): Promise<void>;
  /** Make a document the active one: the one every component talks to outside a document scope. */
  setActive(id: string): void;
  /** The active document's id, or null with none open. */
  getActiveId(): string | null;
  /** The active document's fields, or null with none open. */
  getActive(): DocumentInfo | null;
  /** Every open document in tab order, loading, locked and failed ones included; the same array until one changes. */
  list(): readonly DocumentInfo[];
  /** A document's fields (the one in scope without an id), or null when it isn't open. */
  get(id?: string): DocumentInfo | null;
  /** Whether a document is open. */
  has(id: string): boolean;
  /** How many documents are open. */
  getCount(): number;
  /** The open documents' ids, in tab order. */
  getOrder(): readonly string[];
  /** Put every document in a new order at once; `ids` holds the id of every open document. */
  setOrder(ids: readonly string[]): void;
  /** Move a document to another place in the tab order. */
  move(id: string, toIndex: number): void;
  /** Swap two documents in the tab order. */
  swap(id: string, otherId: string): void;
  /**
   * The PDF with every change, as bytes. It first waits for changes still on their way (text
   * typed a moment ago, writes queued), and runs the document's own save actions around the
   * read when the actions plugin is installed. Afterwards `hasUnsavedChanges` is false, unless
   * something changed meanwhile. Rejects `permission-denied` without `doc.download`,
   * `not-ready` with no open document, `operation-cancelled` when `signal` fires.
   */
  download(id?: string, options?: DownloadOptions): Promise<Uint8Array>;
  /**
   * Only the changes, as a layer artifact you open again over the original
   * (`{ kind: 'layerBytes', baseBytes, layer: { kind: 'artifact', bytes } }`). Waits and runs the
   * save actions like `download()`. Rejects `unsupported` when the document wasn't opened with a
   * layer or the engine keeps layers itself (the cloud engine), and as `download()` does.
   */
  downloadLayer(id?: string, options?: OperationOptions): Promise<Uint8Array>;
  /** Whether the document (the one in scope without an id) may be downloaded: `doc.download`. */
  canDownload(id?: string): boolean;
  /** Whether the document (the one in scope without an id) may be printed: `doc.print`. */
  canPrint(id?: string): boolean;
  /**
   * The document's pages, in order (the one in scope without an id). The same array until a
   * page is added, removed, moved or rotated.
   */
  listPages(id?: string): readonly PageInfo[];
  /** One page, by its `PageRef` or its zero-based index, or null when the document doesn't have it. */
  getPage(page: PageRef | number, id?: string): PageInfo | null;
  /** A page's position, from 0, or `-1` when the document doesn't have it. */
  getPageIndex(ref: PageRef, id?: string): number;
  /** A number that goes up each time pages are added, removed, moved or rotated; `-1` with no document. */
  getRevision(id?: string): number;

  /** A document is open and ready. */
  readonly onOpened: EventHook<DocumentOpenedEvent>;
  /** A document couldn't be opened; its tab shows `error`. */
  readonly onOpenFailed: EventHook<DocumentOpenFailedEvent>;
  /** A document needs its password. */
  readonly onLocked: EventHook<DocumentLockedEvent>;
  /** A document was closed, after its resources were released. */
  readonly onClosed: EventHook<DocumentClosedEvent>;
  /** Another document became the active one. */
  readonly onActiveChanged: EventHook<DocumentActiveChangedEvent>;
  /** Pages were added, removed, moved or rotated. */
  readonly onPagesChanged: EventHook<DocumentPagesChangedEvent>;
  /** A document got its first unsaved change, or was downloaded. */
  readonly onUnsavedChangesChanged: EventHook<DocumentUnsavedChangesChangedEvent>;
}

/** Built-in token for the document registry capability (provided by the kernel). */
export const DocumentsToken: CapabilityToken<DocumentsCapability> = { name: 'documents' };
