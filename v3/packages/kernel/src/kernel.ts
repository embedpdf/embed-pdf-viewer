import { createStore } from './store';
import {
  createEffectContext,
  createPluginContext,
  sliceKey,
  type ContextServices,
} from './context';
import { planPlugins } from './order';
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
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';

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

export interface Kernel {
  readonly engine: Engine;
  readonly documents: DocumentsCapability;
  /** Resolve a capability. For document-scoped tokens, `documentId` defaults to the active doc. */
  capability<T>(token: CapabilityToken<T>, documentId?: string): T;
  /** A token's scope — adapters use this to decide whether to bind a document. */
  scopeOf(token: CapabilityToken<unknown>): PluginScope;
  subscribe(listener: () => void): Unsubscribe;
  getState(): GlobalState;
  start(): Promise<void>;
  destroy(): void;
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
 * Assemble a kernel from an engine + plugins.
 *
 *   planPlugins        — validate dependencies, order them
 *   resolveCapability  — workspace singletons, or per-document instances built lazily
 *   document lifecycle — open the engine handle, register the page registry, bring up
 *                        document-scoped plugins; tear all of it down on close
 *   start / destroy    — run workspace init+effects; clean everything up
 */
export function createKernel(opts: { engine: Engine; plugins: AnyPlugin[] }): Kernel {
  const { engine, plugins } = opts;
  const store = createStore();
  const plan = planPlugins(plugins);
  const documentScopedPlugins = plan.ordered.filter(isDocumentScoped);

  const workspaceCapabilities = new Map<CapabilityToken<unknown>, unknown>();
  const documentCapabilities = new Map<string, unknown>(); // `${pluginId}::${docId}` -> capability
  const documentHandles = new Map<string, DocumentHandle>(); // live engine handles, by docId
  // Live handles whose document is password-locked. Parked OUTSIDE
  // `documentHandles` on purpose: plugins must never reach a locked handle.
  const lockedHandles = new Map<string, DocumentHandle>();
  const workspaceTeardowns: Array<() => void> = [];
  const documentTeardowns = new Map<string, Array<() => void>>();

  const registerTeardown = (teardown: () => void, documentId?: string) => {
    if (documentId) documentTeardowns.get(documentId)?.push(teardown);
    else workspaceTeardowns.push(teardown);
  };
  const documentHandle = (documentId?: string): DocumentHandle | null => {
    const id = documentId ?? store.getCore().activeId;
    return id ? (documentHandles.get(id) ?? null) : null;
  };

  function resolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T {
    const workspaceCapability = workspaceCapabilities.get(token);
    if (workspaceCapability) return workspaceCapability as T;
    const provider = plan.providerOf(token);
    if (!provider) throw new Error(`No capability "${token.name}".`);
    const id = documentId ?? store.getCore().activeId;
    if (!id) throw new Error(`Capability "${token.name}" requires an active document.`);
    const pending = store.getCore().pending[id];
    if (pending) {
      // Fail fast and truthfully: a loading/locked/error document has no
      // plugin instances yet. `useOptional*` adapters turn this into their
      // fallback; strict resolution surfaces the real state.
      throw new Error(
        `Capability "${token.name}" unavailable: document "${id}" is ${pending.status}.`,
      );
    }
    return buildDocumentCapability(provider, id) as T;
  }

  const services: ContextServices = {
    engine,
    store,
    resolveCapability,
    registerTeardown,
    documentHandle,
  };

  function buildDocumentCapability(plugin: AnyPlugin, documentId: string): unknown {
    const key = sliceKey(plugin.id, documentId);
    let capability = documentCapabilities.get(key);
    if (!capability) {
      capability = plugin.capability!(createPluginContext(services, plugin, documentId));
      documentCapabilities.set(key, capability);
    }
    return capability;
  }

  // ── document lifecycle ───────────────────────────────────────────────────────
  function nextActiveDocument(core: CoreState, removedId: string): string | null {
    if (core.activeId !== removedId) return core.activeId;
    const index = core.order.indexOf(removedId);
    const remaining = core.order.filter((id) => id !== removedId);
    return remaining.length === 0 ? null : (remaining[Math.max(0, index - 1)] ?? remaining[0]);
  }

  // Tickets for slots whose real id isn't known yet (thunk sources).
  let ticketCounter = 0;
  const nextTicket = () => `pending:${++ticketCounter}`;

  /** Rekey a pending slot in place (ticket -> engine id). Order position and
   *  activation follow the slot, so the tab never moves or loses selection. */
  function reconcileSlotId(from: string, to: string): string {
    if (from === to) return to;
    const core = store.getCore();
    if (core.documents[to] || core.pending[to]) {
      throw new Error(`[documents] duplicate document id: ${to}`);
    }
    const slot = core.pending[from];
    if (!slot) return to; // slot closed mid-flight; caller's stillWanted() handles it
    const { [from]: _removed, ...pending } = core.pending;
    store.setCore(
      {
        pending: { ...pending, [to]: { ...slot, id: to } },
        order: core.order.map((id) => (id === from ? to : id)),
        activeId: core.activeId === from ? to : core.activeId,
      },
      { type: CORE_ORDER_CHANGED },
    );
    return to;
  }

  /** Pending -> ready: the ONE place a document becomes real. Registers the
   *  handle, swaps the slot for a DocumentMeta (same order position), fires
   *  CORE_DOCUMENT_ADDED, and brings up document-scoped plugins — so plugins
   *  observe exactly the same lifecycle they always did. */
  async function promoteToReady(
    id: string,
    name: string | undefined,
    handle: DocumentHandle,
    snapshot: { pageCount: number; pages: DocumentMeta['pages'] },
  ): Promise<void> {
    const meta: DocumentMeta = {
      id,
      name,
      pageCount: snapshot.pageCount,
      pages: snapshot.pages,
      revision: 0,
    };
    documentHandles.set(id, handle);

    const core = store.getCore();
    const { [id]: _resolved, ...pending } = core.pending;
    store.setCore(
      { documents: { ...core.documents, [id]: meta }, pending },
      { type: CORE_DOCUMENT_ADDED },
    );

    // Document mutation events (rotate/move/delete) replace the page
    // registry in place — the snapshot they carry is byte-identical to
    // pages.list(), so this is a direct swap, no merge. Every document-scoped
    // plugin (every Stage lens) re-derives from the new registry for free.
    // Own mutations and remote (collaborator) mutations arrive identically;
    // the handler is origin-agnostic, as the event model intends.
    documentTeardowns.set(id, []);
    const unsubscribeEvents = handle.events.subscribe((event) => {
      const layout = layoutFromEvent(event);
      if (!layout) return;
      const now = store.getCore();
      const existing = now.documents[id];
      if (!existing) return; // closed mid-flight
      const updated: DocumentMeta = {
        ...existing,
        pageCount: layout.pageCount,
        pages: layout.pages,
        revision: existing.revision + 1,
      };
      store.setCore(
        { documents: { ...now.documents, [id]: updated } },
        { type: CORE_DOCUMENT_PAGES_UPDATED },
      );
    });
    documentTeardowns.get(id)!.push(unsubscribeEvents);

    for (const plugin of documentScopedPlugins) {
      store.registerSlice(sliceKey(plugin.id, id), reducerOf(plugin), initialStateOf(plugin));
    }
    for (const plugin of documentScopedPlugins) {
      await plugin.init?.(createPluginContext(services, plugin, id));
    }
    for (const plugin of documentScopedPlugins) {
      plugin.effects?.(createEffectContext(services, plugin, id));
    }
  }

  async function openDocument(input: OpenSource, options?: OpenDocumentOptions): Promise<string> {
    const { activate, name, ...engineOptions } = options ?? {};

    // 1. Reserve the tab slot SYNCHRONOUSLY (this runs before the first
    //    await): id, order position, and activation are decided at request
    //    time; only the content arrives at completion time. Fire-and-forget
    //    concurrent opens therefore keep call order as tab order.
    let id = typeof input === 'function' ? nextTicket() : (idOfInput(input) ?? nextTicket());
    const reserved = store.getCore();
    if (reserved.documents[id] || reserved.pending[id]) {
      throw new Error(`[documents] document already open: ${id}`);
    }
    store.setCore(
      {
        pending: { ...reserved.pending, [id]: { id, name, status: 'loading' } },
        order: [...reserved.order, id],
        activeId: (activate ?? true) || reserved.activeId === null ? id : reserved.activeId,
      },
      { type: CORE_DOCUMENT_OPENING },
    );
    const stillWanted = () => store.getCore().pending[id] !== undefined;

    try {
      const source = typeof input === 'function' ? await input() : input;
      if (!stillWanted()) throw new Error(`[documents] closed while opening: ${id}`);
      const sourceId = idOfInput(source);
      if (sourceId) id = reconcileSlotId(id, sourceId);

      const handle = await engine.open(source, engineOptions);
      if (!stillWanted()) {
        await handle.close();
        throw new Error(`[documents] closed while opening: ${id}`);
      }
      if (handle.id !== id) id = reconcileSlotId(id, handle.id);

      // 2. A password-locked handle parks here — BEFORE pages.list(), which
      //    would reject on a locked document. `documents.unlock()` finishes
      //    the job later. `passwordProvided` records that a supplied password
      //    was already tried and rejected (drives the "incorrect" copy).
      if (handle.security?.passwordPrompt?.state === 'required') {
        const passwordProvided =
          ('password' in engineOptions && engineOptions.password != null) ||
          passwordOfInput(source) != null;
        lockedHandles.set(id, handle);
        const now = store.getCore();
        store.setCore(
          { pending: { ...now.pending, [id]: { id, name, status: 'locked', passwordProvided } } },
          { type: CORE_DOCUMENT_LOCKED },
        );
        return id;
      }

      const snapshot = await handle.pages.list();
      if (!stillWanted()) {
        await handle.close();
        throw new Error(`[documents] closed while opening: ${id}`);
      }
      await promoteToReady(id, name, handle, snapshot);
      return id;
    } catch (error) {
      // 3. The tab stays, flagged — closable, and (later) retryable. Skipped
      //    when the slot is already gone (user closed the loading tab).
      if (stillWanted()) {
        const now = store.getCore();
        store.setCore(
          { pending: { ...now.pending, [id]: { id, name, status: 'error', error } } },
          { type: CORE_DOCUMENT_OPEN_FAILED },
        );
      }
      throw error;
    }
  }

  async function unlockDocument(id: string, input: { password: string }): Promise<void> {
    const slot = store.getCore().pending[id];
    const handle = lockedHandles.get(id);
    if (!slot || slot.status !== 'locked' || !handle) {
      throw new Error(`[documents] document is not locked: ${id}`);
    }
    // Engine-agnostic by design: local loads the parked worker bytes, cloud
    // POSTs /access — same call, same result. A wrong password rejects here
    // (DocPasswordIncorrect) and the document simply stays locked.
    await handle.security.unlock({ password: input.password });
    if (!store.getCore().pending[id]) return; // closed while unlocking
    const snapshot = await handle.pages.list();
    if (!store.getCore().pending[id]) return;
    lockedHandles.delete(id);
    await promoteToReady(id, slot.name, handle, snapshot);
  }

  async function closeDocument(documentId: string): Promise<void> {
    // Pending slot (loading / locked / error): remove the tab; a parked
    // locked handle is disposed, an in-flight open notices the missing slot
    // when it lands and closes its own handle.
    const pendingCore = store.getCore();
    if (pendingCore.pending[documentId]) {
      const { [documentId]: _removed, ...pending } = pendingCore.pending;
      store.setCore(
        {
          pending,
          order: pendingCore.order.filter((id) => id !== documentId),
          activeId: nextActiveDocument(pendingCore, documentId),
        },
        { type: CORE_DOCUMENT_REMOVED },
      );
      const locked = lockedHandles.get(documentId);
      lockedHandles.delete(documentId);
      await locked?.close();
      return;
    }

    (documentTeardowns.get(documentId) ?? []).forEach((teardown) => teardown());
    documentTeardowns.delete(documentId);
    for (const plugin of documentScopedPlugins) {
      documentCapabilities.delete(sliceKey(plugin.id, documentId));
      store.removeSlice(sliceKey(plugin.id, documentId));
    }
    const core = store.getCore();
    if (!core.documents[documentId]) return;
    const { [documentId]: _removed, ...documents } = core.documents;
    store.setCore(
      {
        documents,
        order: core.order.filter((id) => id !== documentId),
        activeId: nextActiveDocument(core, documentId),
      },
      { type: CORE_DOCUMENT_REMOVED },
    );
    const handle = documentHandles.get(documentId);
    documentHandles.delete(documentId);
    await handle?.close();
  }

  function reorder(next: string[]) {
    store.setCore({ order: next }, { type: CORE_ORDER_CHANGED });
  }

  const documents: DocumentsCapability = {
    open: openDocument,
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
    scopeOf: plan.scopeOf,
    subscribe: store.subscribe,
    getState: store.getState,
    start: async () => {
      for (const plugin of plan.ordered) {
        if (!isDocumentScoped(plugin)) await plugin.init?.(createPluginContext(services, plugin));
      }
      for (const plugin of plan.ordered) {
        if (!isDocumentScoped(plugin)) plugin.effects?.(createEffectContext(services, plugin));
      }
    },
    destroy: () => {
      for (const teardowns of documentTeardowns.values())
        teardowns.forEach((teardown) => teardown());
      documentTeardowns.clear();
      // Parked locked handles hold worker-side resources (retained bytes) —
      // release them; destroy() is sync, so fire-and-forget.
      for (const handle of lockedHandles.values()) void handle.close();
      lockedHandles.clear();
      while (workspaceTeardowns.length) workspaceTeardowns.pop()!();
    },
  };
}
