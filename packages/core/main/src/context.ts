import type {
  Action,
  AnyPlugin,
  CapabilityToken,
  DocumentHandle,
  DocumentMeta,
  EffectContext,
  Engine,
  PluginContext,
} from './types';
import { DocumentsToken } from './types';
import type { SliceLease, Store } from './store';
import type { Scope } from './scope';
import { PluginError } from './errors';
import { isDev } from './env';

/** A plugin's slice key. Workspace plugins use their id; document-scoped plugins are per-document. */
export const sliceKey = (pluginId: string, documentId?: string): string =>
  documentId ? `${pluginId}::${documentId}` : pluginId;

/**
 * The slice of a DocumentSession a context needs — structural, so this module
 * has no cycle with the kernel. Holding the session OBJECT (not its id) is
 * what makes late teardown registration safe: a context created for a session
 * can always reach that session's scope, even after the session has been
 * closed and removed from the kernel's map.
 */
export interface SessionRef {
  id: string;
  /** Unique per open; a reopened id gets a new one. */
  readonly instanceId: string;
  handle: DocumentHandle | null;
  /** Meta staged during bring-up, before the document is published. */
  stagedMeta: DocumentMeta | null;
  readonly scope: Scope;
  /** Aborted when close() begins. */
  readonly signal: AbortSignal;
  readonly leases: Map<AnyPlugin, SliceLease<unknown, Action>>;
}

/**
 * Everything a context needs from the kernel, injected so this module has no cycles
 * with the capability resolver or the document lifecycle.
 */
export interface ContextServices {
  readonly engine: Engine;
  readonly store: Store;
  readonly workspaceScope: Scope;
  /** Aborted when destroy() begins. */
  readonly workspaceSignal: AbortSignal;
  readonly workspaceLeases: Map<AnyPlugin, SliceLease<unknown, Action>>;
  readonly report: (error: unknown) => void;
  resolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T;
  /** Total resolution (the kernel's internal rule: bring-up or ready) — what
   *  `ctx.tryGet` delegates to. Never exception-driven: a throwing capability
   *  constructor is a BUG and propagates. */
  tryResolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T | null;
  documentHandle(documentId?: string): DocumentHandle | null;
}

/**
 * The tokens a plugin may resolve: its declared `requires` and `optional`, its
 * own token, and the always-available documents token. Resolving anything else
 * is a lie in the dependency graph (the kernel cannot order or validate what it
 * does not know about), so in development it throws with the remedy.
 */
function declaredTokens(plugin: AnyPlugin): Set<CapabilityToken<unknown>> {
  const declared = new Set<CapabilityToken<unknown>>([
    DocumentsToken,
    ...(plugin.requires ?? []),
    ...(plugin.optional ?? []),
  ]);
  if (plugin.token) declared.add(plugin.token);
  return declared;
}

/**
 * Build the context a plugin sees. When `session` is given the context is bound
 * to that document — `getState`/`dispatch` target its slice, `document()` returns
 * it, and `get()` resolves document-scoped capabilities for it.
 */
export function createPluginContext(
  services: ContextServices,
  plugin: AnyPlugin,
  session?: SessionRef,
): PluginContext<unknown> {
  const { engine, store } = services;
  const documentId = session?.id;
  const ownScope = session?.scope ?? services.workspaceScope;
  const lease = (session?.leases ?? services.workspaceLeases).get(plugin);
  if (!lease) {
    throw new Error(
      `[kernel] no state lease for plugin "${plugin.id}" (${documentId ?? 'workspace'})`,
    );
  }
  const declared = declaredTokens(plugin);
  const guard = (token: CapabilityToken<unknown>) => {
    if (isDev() && !declared.has(token)) {
      throw new Error(
        `[kernel] plugin "${plugin.id}" resolved capability "${token.name}" without declaring it; ` +
          `add the token to its \`requires\` or \`optional\` list.`,
      );
    }
  };
  let reportedClosed = false;
  return {
    id: plugin.id,
    engine,
    documentId,
    doc: session ? session.handle : services.documentHandle(undefined),
    documentHandle: (requestedDocumentId) =>
      requestedDocumentId
        ? services.documentHandle(requestedDocumentId)
        : session
          ? session.handle
          : services.documentHandle(undefined),
    getState: () => lease.read(),
    dispatch: (action: Action) => {
      if (lease.commit(action) || reportedClosed) return;
      // Reported once per context: a retained callback dispatching into a
      // closed instance is a bug worth surfacing, not a storm worth logging.
      reportedClosed = true;
      services.report(
        new PluginError(
          'instance-closed',
          plugin.id,
          `dispatch of "${action.type}" after the instance closed (${lease.instanceId}); dropped`,
        ),
      );
    },
    subscribe: store.subscribe,
    core: store.getCore,
    document: () => {
      if (session) return store.getCore().documents[session.id] ?? session.stagedMeta;
      const id = store.getCore().activeId;
      return id ? (store.getCore().documents[id] ?? null) : null;
    },
    get: <T>(token: CapabilityToken<T>): T => (
      guard(token),
      services.resolveCapability(token, documentId)
    ),
    forDocument: <T>(token: CapabilityToken<T>, otherDocumentId: string): T => (
      guard(token),
      services.resolveCapability(token, otherDocumentId)
    ),
    tryGet: <T>(token: CapabilityToken<T>): T | null => (
      guard(token),
      services.tryResolveCapability(token, documentId)
    ),
    tryForDocument: <T>(token: CapabilityToken<T>, otherDocumentId: string): T | null => (
      guard(token),
      services.tryResolveCapability(token, otherDocumentId)
    ),
    cleanup: (teardown) => ownScope.defer(teardown),
  };
}

/** A plugin context plus the side-effect primitives (watch / onAction / cleanup). */
export function createEffectContext(
  services: ContextServices,
  plugin: AnyPlugin,
  session?: SessionRef,
): EffectContext<unknown> {
  const { store } = services;
  const ownScope = session?.scope ?? services.workspaceScope;
  return {
    ...createPluginContext(services, plugin, session),
    watch: (select, handler, isEqual = Object.is) => {
      let previous = select();
      const unsubscribe = store.subscribe(() => {
        const next = select();
        if (!isEqual(previous, next)) {
          const prior = previous;
          previous = next;
          handler(next, prior);
        }
      });
      ownScope.defer(unsubscribe);
      return unsubscribe;
    },
    onAction: (type, handler) => {
      const unsubscribe = store.subscribeAction((action) => {
        if (action.type === type) handler(action);
      });
      ownScope.defer(unsubscribe);
      return unsubscribe;
    },
  };
}
