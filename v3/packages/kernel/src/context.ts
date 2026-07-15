import type {
  Action,
  AnyPlugin,
  CapabilityToken,
  DocumentHandle,
  EffectContext,
  Engine,
  PluginContext,
} from './types';
import type { Store } from './store';

/** A plugin's slice key. Workspace plugins use their id; document-scoped plugins are per-document. */
export const sliceKey = (pluginId: string, documentId?: string): string =>
  documentId ? `${pluginId}::${documentId}` : pluginId;

/**
 * Everything a context needs from the kernel, injected so this module has no cycles
 * with the capability resolver or the document lifecycle.
 */
export interface ContextServices {
  readonly engine: Engine;
  readonly store: Store;
  resolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T;
  registerTeardown(teardown: () => void, documentId?: string): void;
  documentHandle(documentId?: string): DocumentHandle | null;
}

/**
 * Build the context a plugin sees. When `documentId` is given the context is bound
 * to that document — `getState`/`dispatch` target its slice, `document()` returns
 * it, and `get()` resolves document-scoped capabilities for it.
 */
export function createPluginContext(
  services: ContextServices,
  plugin: AnyPlugin,
  documentId?: string,
): PluginContext<unknown> {
  const { engine, store } = services;
  const key = sliceKey(plugin.id, documentId);
  return {
    id: plugin.id,
    engine,
    documentId,
    doc: services.documentHandle(documentId),
    documentHandle: (requestedDocumentId) =>
      services.documentHandle(requestedDocumentId ?? documentId),
    getState: () => store.getSlice(key),
    dispatch: (action: Action) => store.dispatchTo(key, action),
    subscribe: store.subscribe,
    core: store.getCore,
    document: () => {
      const id = documentId ?? store.getCore().activeId;
      return id ? (store.getCore().documents[id] ?? null) : null;
    },
    get: <T>(token: CapabilityToken<T>): T => services.resolveCapability(token, documentId),
    forDocument: <T>(token: CapabilityToken<T>, otherDocumentId: string): T =>
      services.resolveCapability(token, otherDocumentId),
    tryGet: <T>(token: CapabilityToken<T>): T | null => {
      try {
        return services.resolveCapability(token, documentId);
      } catch {
        return null;
      }
    },
    cleanup: (teardown) => services.registerTeardown(teardown, documentId),
  };
}

/** A plugin context plus the side-effect primitives (watch / onAction / cleanup). */
export function createEffectContext(
  services: ContextServices,
  plugin: AnyPlugin,
  documentId?: string,
): EffectContext<unknown> {
  const { store } = services;
  return {
    ...createPluginContext(services, plugin, documentId),
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
      services.registerTeardown(unsubscribe, documentId);
      return unsubscribe;
    },
    onAction: (type, handler) => {
      const unsubscribe = store.subscribeAction((action) => {
        if (action.type === type) handler(action);
      });
      services.registerTeardown(unsubscribe, documentId);
      return unsubscribe;
    },
  };
}
