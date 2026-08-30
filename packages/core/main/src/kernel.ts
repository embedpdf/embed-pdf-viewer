import { createStore } from './store';
import {
  createEffectContext,
  createPluginContext,
  sliceKey,
  type ContextServices,
  type SessionRef,
} from './context';
import { planPlugins } from './order';
import { createScope, CancelledError, isCancelled, type Scope } from './scope';
import {
  CORE_ACTIVE_CHANGED,
  CORE_DOCUMENT_ADDED,
  CORE_DOCUMENT_LOCKED,
  CORE_DOCUMENT_OPENING,
  CORE_DOCUMENT_OPEN_FAILED,
  CORE_DOCUMENT_PAGES_UPDATED,
  CORE_DOCUMENT_REMOVED,
  CORE_ORDER_CHANGED,
  DocumentsToken,
  type Action,
  type AnyPlugin,
  type CapabilityToken,
  type CoreState,
  type DocInfo,
  type DocumentHandle,
  type DocumentMeta,
  type DocumentsCapability,
  type Engine,
  type GlobalState,
  type OpenDocumentOptions,
  type OpenInput,
  type OpenSource,
  type PendingMeta,
  type PluginScope,
  type Unsubscribe,
} from './types';
import {
  CONTINUOUS_RENDER_POLICY,
  type DocumentEvent,
  type EngineRenderPolicy,
} from '@embedpdf/engine-core/runtime';

/** The new page registry a document mutation carries, or null for events that
 *  don't change page structure (annotations, metadata). The snapshot is the
 *  same shape `pages.list()` returns, so callers swap it in directly. */
function layoutFromEvent(event: DocumentEvent) {
  switch (event.type) {
    case 'pages.moved':
    case 'pages.rotated':
    case 'pages.deleted':
    case 'pages.inserted':
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

export interface Kernel {
  readonly engine: Engine;
  readonly documents: DocumentsCapability;
  /** Resolve a capability. For document-scoped tokens, `documentId` defaults to the active doc. */
  capability<T>(token: CapabilityToken<T>, documentId?: string): T;
  /**
   * Total sibling of `capability()`: `null` instead of throwing — no
   * provider, no document, or a document that isn't `ready` yet. This is the
   * method adapters subscribe to (`useKernelValue`-style): resolution is a
   * VALUE derived from kernel state, not a pure function of its arguments —
   * a pending document's promotion changes the result while the id stays the
   * same, so caching a `capability()` call by id goes stale. The returned
   * instance is reference-stable per (plugin, document), so equality-cached
   * reads don't churn.
   */
  tryCapability<T>(token: CapabilityToken<T>, documentId?: string): T | null;
  /** A token's scope — adapters use this to decide whether to bind a document. */
  scopeOf(token: CapabilityToken<unknown>): PluginScope;
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
const initialStateOf = (plugin: AnyPlugin): unknown =>
  typeof plugin.initialState === 'function'
    ? (plugin.initialState as () => unknown)()
    : (plugin.initialState ?? {});
const reducerOf = (plugin: AnyPlugin) =>
  (plugin.reduce ?? ((state: unknown) => state)) as (state: unknown, action: Action) => unknown;
const toDocInfo = (meta: DocumentMeta): DocInfo => ({
  id: meta.id,
  name: meta.name,
  status: 'ready',
  pageCount: meta.pageCount,
});
const pendingToDocInfo = (meta: PendingMeta): DocInfo => ({
  id: meta.id,
  name: meta.name,
  status: meta.status,
  pageCount: 0,
  passwordProvided: meta.passwordProvided,
});

/** The stable id an input implies, if it carries one ('bytes'/'layerBytes'/'id'). */
const idOfInput = (input: OpenInput): string | null =>
  'id' in input && typeof input.id === 'string' ? input.id : null;
const passwordOfInput = (input: OpenInput): string | null | undefined =>
  'password' in input ? input.password : undefined;

/**
 * Everything one open document owns, in one place: the engine handle, the
 * resource scope (event subs, slices, plugin cleanups, the handle's own
 * close), the capability instances, and the in-flight lifecycle operation.
 * The session IS the document's lifecycle; the store's `documents`/`pending`
 * entries are its UI projection.
 *
 *   opening — slot reserved; source resolving / engine opening
 *   locked  — parked on a password; the scope already owns handle.close
 *   bringup — post-security: slices, inits, effect setup; NOT yet published
 *   ready   — committed; the only phase adapters resolve capabilities in
 *   error   — open failed after the slot was reserved; resources disposed
 *   closing — close() won; unpublished, joining the operation, disposing
 */
interface DocumentSession extends SessionRef {
  name?: string;
  phase: 'opening' | 'locked' | 'bringup' | 'ready' | 'error' | 'closing';
  /** In-flight open/unlock — close() cancels, then JOINS this before disposing,
   *  so "close resolved" means "no producer is still acquiring resources". */
  operation: Promise<unknown> | null;
  /** The current engine call, retained so close() can abort real worker-side
   *  work instead of waiting for it to land at a checkpoint. */
  engineOp: { abort(reason?: unknown): void } | null;
  cancel: AbortController;
  capabilities: Map<AnyPlugin, unknown>;
  close(): Promise<void>;
}

/** Engine rejections carry AbortError when close() aborts the live call;
 *  match structurally so test fakes with plain promises still work. */
const isAbortLike = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/**
 * Assemble a kernel from an engine + plugins.
 *
 *   planPlugins        — validate dependencies, order them
 *   resolveCapability  — workspace singletons, or per-document instances built lazily
 *   document lifecycle — one DocumentSession per document: transactional open
 *                        (publish-last), one idempotent close for every phase
 *   start / destroy    — explicit status machine; destroy closes everything
 *
 * The kernel closes every handle it opened; it never destroys the engine —
 * ownership follows acquisition, and the engine was handed in by the caller.
 */
export function createKernel(opts: {
  engine: Engine;
  plugins: AnyPlugin[];
  /** Observability seam: teardown/effect/join failures land here. Default: console.error. */
  report?: (error: unknown) => void;
}): Kernel {
  const { engine, plugins } = opts;
  const report = opts.report ?? ((error: unknown) => console.error('[kernel]', error));
  const store = createStore(report);
  const plan = planPlugins(plugins);
  const documentScopedPlugins = plan.ordered.filter(isDocumentScoped);

  const workspaceCapabilities = new Map<CapabilityToken<unknown>, unknown>();
  const workspaceScope = createScope(report);
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
   *   - the await RACES the cancellation, so close()'s join never blocks on a
   *     call that cannot be aborted (a plain-promise engine, a stuck fetch).
   * When cancellation wins but the call later lands anyway, `onLateResult`
   * routes the result into the session scope — whose late-defer rule runs it
   * immediately after disposal — so a late-arriving resource cannot leak.
   * (Plugin inits are deliberately NOT raced: they are first-party code that
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
    const session: DocumentSession = {
      id,
      name,
      phase: 'opening',
      handle: null,
      stagedMeta: null,
      scope: createScope(report),
      operation: null,
      engineOp: null,
      cancel: new AbortController(),
      capabilities: new Map(),
      close: () => closeSession(session),
    };
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
      throw new Error(`[documents] duplicate document id: ${nextId}`);
    }
    sessions.delete(previousId);
    session.id = nextId;
    sessions.set(nextId, session);
    const slot = core.pending[previousId];
    if (slot) {
      const { [previousId]: _moved, ...pending } = core.pending;
      store.setCore(
        {
          pending: { ...pending, [nextId]: { ...slot, id: nextId } },
          order: core.order.map((id) => (id === previousId ? nextId : id)),
          activeId: core.activeId === previousId ? nextId : core.activeId,
        },
        { type: CORE_ORDER_CHANGED },
      );
    }
  }

  const closingSessions = new WeakMap<DocumentSession, Promise<void>>();
  function closeSession(session: DocumentSession): Promise<void> {
    const inFlight = closingSessions.get(session);
    if (inFlight) return inFlight;
    const closing = (async () => {
      session.phase = 'closing';
      unpublishSlot(session.id); // synchronous: the tab disappears NOW
      // Cancel, JOIN the producer, then drain its resources — in that order.
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
    store.setCore(
      {
        pending: {
          ...core.pending,
          [session.id]: { id: session.id, name: session.name, status: 'loading' },
        },
        order: [...core.order, session.id],
        activeId: activate || core.activeId === null ? session.id : core.activeId,
      },
      { type: CORE_DOCUMENT_OPENING },
    );
  }

  function publishLocked(session: DocumentSession, passwordProvided: boolean): void {
    const core = store.getCore();
    store.setCore(
      {
        pending: {
          ...core.pending,
          [session.id]: { id: session.id, name: session.name, status: 'locked', passwordProvided },
        },
      },
      { type: CORE_DOCUMENT_LOCKED },
    );
  }

  function publishError(session: DocumentSession, error: unknown): void {
    const core = store.getCore();
    store.setCore(
      {
        pending: {
          ...core.pending,
          [session.id]: { id: session.id, name: session.name, status: 'error', error },
        },
      },
      { type: CORE_DOCUMENT_OPEN_FAILED },
    );
  }

  function unpublishSlot(id: string): void {
    const core = store.getCore();
    if (!core.pending[id] && !core.documents[id]) return;
    const { [id]: _pending, ...pending } = core.pending;
    const { [id]: _document, ...documents } = core.documents;
    store.setCore(
      {
        pending,
        documents,
        order: core.order.filter((other) => other !== id),
        activeId: nextActiveDocument(core, id),
      },
      { type: CORE_DOCUMENT_REMOVED },
    );
  }

  /** The ONE ready transition: swap the pending slot for the staged meta and
   *  fire CORE_DOCUMENT_ADDED. Everything before this is unpublished and rolls
   *  back by disposing the session scope; nothing after this can fail. */
  function commitReady(session: DocumentSession): void {
    session.phase = 'ready';
    const meta = session.stagedMeta!;
    const core = store.getCore();
    const { [session.id]: _resolved, ...pending } = core.pending;
    store.setCore(
      { documents: { ...core.documents, [session.id]: meta }, pending },
      { type: CORE_DOCUMENT_ADDED },
    );
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

  function buildDocumentCapability(plugin: AnyPlugin, session: DocumentSession): unknown {
    let capability = session.capabilities.get(plugin);
    if (!capability) {
      capability = plugin.capability!(createPluginContext(services, plugin, session));
      session.capabilities.set(plugin, capability);
    }
    return capability;
  }

  function resolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T {
    guardUsable(`capability("${token.name}")`);
    const workspaceCapability = workspaceCapabilities.get(token);
    if (workspaceCapability) return workspaceCapability as T;
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
    if (workspaceCapability) return workspaceCapability as T;
    const provider = plan.providerOf(token);
    if (!provider) return null;
    const session = sessionOf(documentId);
    if (!session || (session.phase !== 'bringup' && session.phase !== 'ready')) return null;
    return buildDocumentCapability(provider, session) as T;
  }

  /** Public total resolver — see `Kernel.tryCapability`. `ready` only: the
   *  null→instance flip at commit time IS the adapters' re-render signal. */
  function tryResolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T | null {
    if (status === 'destroying' || status === 'destroyed') return null;
    const workspaceCapability = workspaceCapabilities.get(token);
    if (workspaceCapability) return workspaceCapability as T;
    const provider = plan.providerOf(token);
    if (!provider) return null;
    const session = sessionOf(documentId);
    if (!session || session.phase !== 'ready') return null;
    return buildDocumentCapability(provider, session) as T;
  }

  const services: ContextServices = {
    engine,
    store,
    workspaceScope,
    resolveCapability,
    tryResolveCapability: tryResolveInternal,
    documentHandle,
  };

  // ── document lifecycle ───────────────────────────────────────────────────────

  // Tickets for slots whose real id isn't known yet (thunk sources).
  let ticketCounter = 0;
  const nextTicket = () => `pending:${++ticketCounter}`;

  /** Slices + event subscription + plugin inits + effect SETUP — every step's
   *  release deferred into the session scope, every await followed by a
   *  checkpoint. Runs entirely pre-commit: a failure anywhere rolls the whole
   *  session back and the document was never `ready`. */
  async function bringUp(
    session: DocumentSession,
    snapshot: { pageCount: number; pages: DocumentMeta['pages'] },
  ): Promise<void> {
    session.phase = 'bringup';
    // The render policy is a document FACT (Pattern A, like the page
    // registry): async on the engine contract, materialized ONCE here —
    // pre-publish — so every consumer reads it synchronously off the meta
    // and no "policy still resolving" state exists anywhere downstream.
    // Best-effort by design: no render service, or a failed read, means
    // `continuous` — a policy hiccup must never block a document open.
    let renderPolicy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY;
    try {
      renderPolicy = (await session.handle!.render?.policy()) ?? CONTINUOUS_RENDER_POLICY;
    } catch {
      /* unreachable policy = continuous */
    }
    checkpoint(session);
    session.stagedMeta = {
      id: session.id,
      name: session.name,
      pageCount: snapshot.pageCount,
      pages: snapshot.pages,
      revision: 0,
      renderPolicy,
    };

    // Document mutation events (rotate/move/delete) replace the page
    // registry in place — the snapshot they carry is byte-identical to
    // pages.list(), so this is a direct swap, no merge. Own mutations and
    // remote (collaborator) mutations arrive identically; the handler is
    // origin-agnostic, as the event model intends.
    const unsubscribeEvents = session.handle!.events.subscribe((event) => {
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
      store.setCore(
        { documents: { ...now.documents, [session.id]: updated } },
        { type: CORE_DOCUMENT_PAGES_UPDATED },
      );
    });
    session.scope.defer(unsubscribeEvents);

    for (const plugin of documentScopedPlugins) {
      const key = sliceKey(plugin.id, session.id);
      store.registerSlice(key, reducerOf(plugin), initialStateOf(plugin));
      session.scope.defer(() => store.removeSlice(key)); // LIFO ⇒ reverse dependency order
    }
    for (const plugin of documentScopedPlugins) {
      await plugin.init?.(createPluginContext(services, plugin, session));
      checkpoint(session);
    }
    // Effect SETUP is part of the transaction (it can throw); the callbacks
    // it registers fire post-commit and are isolated by the store instead.
    for (const plugin of documentScopedPlugins) {
      plugin.effects?.(createEffectContext(services, plugin, session));
    }
    checkpoint(session);
  }

  async function openDocument(input: OpenSource, options?: OpenDocumentOptions): Promise<string> {
    guardUsable('documents.open()');
    const { activate, name, ...engineOptions } = options ?? {};

    // 1. Reserve the tab slot SYNCHRONOUSLY (before the first await): id,
    //    order position, and activation are decided at request time; only the
    //    content arrives at completion time. Fire-and-forget concurrent opens
    //    therefore keep call order as tab order.
    const requestedId =
      typeof input === 'function' ? nextTicket() : (idOfInput(input) ?? nextTicket());
    if (sessions.has(requestedId)) {
      throw new Error(`[documents] document already open: ${requestedId}`);
    }
    const session = createSession(requestedId, name);
    sessions.set(session.id, session);
    publishPendingSlot(session, activate ?? true);

    return beginOperation(session, async () => {
      try {
        const source =
          typeof input === 'function'
            ? await engineCall(session, Promise.resolve(input(session.cancel.signal)))
            : input;
        checkpoint(session);
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

        // 2. A password-locked handle parks here — BEFORE pages.list(), which
        //    would reject on a locked document. `documents.unlock()` finishes
        //    the job later. `passwordProvided` records that a supplied password
        //    was already tried and rejected (drives the "incorrect" copy).
        if (handle.security?.passwordPrompt?.state === 'required') {
          const passwordProvided =
            ('password' in engineOptions && engineOptions.password != null) ||
            passwordOfInput(source) != null;
          session.phase = 'locked';
          publishLocked(session, passwordProvided);
          return session.id;
        }

        const snapshot = await engineCall(session, handle.pages.list());
        checkpoint(session);
        await bringUp(session, snapshot);
        commitReady(session);
        return session.id;
      } catch (error) {
        // Close won the race: close() owns unpublish + disposal; just get out
        // of its way, rejecting with the typed cancellation either way.
        if (isCancelled(error)) throw error;
        if (session.phase === 'closing' || isAbortLike(error)) {
          throw new CancelledError(`closed while opening: ${session.id}`);
        }
        // 3. Real failure: ROLLBACK (scope releases exactly what was acquired,
        //    however far we got), then park the tab as `error` — closable, and
        //    reopenable after close. The document was never `ready`.
        await session.scope.dispose();
        session.phase = 'error';
        publishError(session, error);
        throw error;
      }
    });
  }

  async function unlockDocument(id: string, input: { password: string }): Promise<void> {
    guardUsable('documents.unlock()');
    const session = sessions.get(id);
    if (!session || session.phase !== 'locked' || !session.handle) {
      throw new Error(`[documents] document is not locked: ${id}`);
    }
    const handle = session.handle;
    return beginOperation(session, async () => {
      // Engine-agnostic by design: local loads the parked worker bytes, cloud
      // POSTs /access — same call, same result. A WRONG PASSWORD rejects here
      // and nothing changes: the document stays locked, unlock is retryable.
      try {
        await engineCall(session, handle.security.unlock({ password: input.password }));
      } catch (error) {
        if (session.phase === 'closing' || isAbortLike(error)) {
          throw new CancelledError(`closed while opening: ${session.id}`);
        }
        throw error; // still locked — deliberately no state change
      }
      checkpoint(session);
      // Past the password: failures from here are REAL open failures — the
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
    });
  }

  async function closeDocument(documentId: string): Promise<void> {
    const session = sessions.get(documentId);
    if (!session) return; // idempotent — unknown or already closed
    await session.close();
  }

  function reorder(next: string[]) {
    store.setCore({ order: next }, { type: CORE_ORDER_CHANGED });
  }

  const documents: DocumentsCapability = {
    open: openDocument,
    openAll: (docs) => {
      guardUsable('documents.openAll()');
      // Fire-and-forget on purpose: each open() reserves its tab slot
      // synchronously, so tabs exist immediately in array order; exactly one
      // activation, decided here at request time. Failures are tab state
      // (`error`/`locked`), never unhandled rejections.
      const activeIndex = Math.max(
        0,
        docs.findIndex((d) => d.active),
      );
      docs.forEach(({ source, active: _active, ...options }, index) => {
        void openDocument(source, { ...options, activate: index === activeIndex }).catch(() => {});
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
      if (core.documents[id] || core.pending[id])
        store.setCore({ activeId: id }, { type: CORE_ACTIVE_CHANGED });
    },
    activeId: () => store.getCore().activeId,
    list: (): DocInfo[] =>
      store.getCore().order.map((id) => {
        const core = store.getCore();
        const meta = core.documents[id];
        return meta ? toDocInfo(meta) : pendingToDocInfo(core.pending[id]);
      }),
    get: (id) => {
      const core = store.getCore();
      const meta = core.documents[id];
      if (meta) return toDocInfo(meta);
      const pending = core.pending[id];
      return pending ? pendingToDocInfo(pending) : null;
    },
    has: (id) => {
      const core = store.getCore();
      return core.documents[id] !== undefined || core.pending[id] !== undefined;
    },
    count: () => store.getCore().order.length,
    order: () => [...store.getCore().order],
    move: (id, toIndex) => {
      const core = store.getCore();
      if (!core.documents[id] && !core.pending[id]) return;
      const without = core.order.filter((x) => x !== id);
      const clamped = Math.max(0, Math.min(toIndex, without.length));
      without.splice(clamped, 0, id);
      reorder(without);
    },
    swap: (a, b) => {
      const core = store.getCore();
      const indexA = core.order.indexOf(a);
      const indexB = core.order.indexOf(b);
      if (indexA < 0 || indexB < 0) return;
      const next = [...core.order];
      next[indexA] = b;
      next[indexB] = a;
      reorder(next);
    },
    // Document IO — siblings of open/close, straight to the live engine handle.
    download: (id, opts) => {
      const handle = documentHandle(id);
      if (!handle) return Promise.reject(new Error('[documents] no document to download'));
      return handle.download(opts);
    },
    downloadLayer: (id) => {
      const handle = documentHandle(id);
      if (!handle) return Promise.reject(new Error('[documents] no document to download'));
      if (!handle.downloadLayer) {
        return Promise.reject(
          new Error(
            '[documents] this engine cannot export a layer (open with a layer on the local engine)',
          ),
        );
      }
      return handle.downloadLayer();
    },
    // The PERMISSIONS.md chrome exception: print/download are kernel verbs
    // with 1:1 capabilities, so their authority question is answered here.
    allows: (cap, id) => documentHandle(id)?.security.allows(cap) ?? false,
  };
  workspaceCapabilities.set(DocumentsToken, documents);

  // ── workspace plugins: seed slices, then build their capabilities ────────────
  for (const plugin of plan.ordered) {
    if (!isDocumentScoped(plugin))
      store.registerSlice(plugin.id, reducerOf(plugin), initialStateOf(plugin));
  }
  for (const plugin of plan.ordered) {
    if (!isDocumentScoped(plugin) && plugin.token && plugin.capability) {
      workspaceCapabilities.set(
        plugin.token,
        plugin.capability(createPluginContext(services, plugin)),
      );
    }
  }

  return {
    engine,
    documents,
    capability: resolveCapability,
    tryCapability: tryResolveCapability,
    scopeOf: plan.scopeOf,
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
            if (status !== 'starting') return; // destroy() raced us — stop within one init
            if (!isDocumentScoped(plugin))
              await plugin.init?.(createPluginContext(services, plugin));
          }
          if (status !== 'starting') return;
          for (const plugin of plan.ordered) {
            if (!isDocumentScoped(plugin)) plugin.effects?.(createEffectContext(services, plugin));
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
        await startPromise?.catch((error) => {
          if (!isCancelled(error) && !wasFailed) report(error);
        });
        // Close every session — the RESOURCE-owning map, not store.order: a
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
