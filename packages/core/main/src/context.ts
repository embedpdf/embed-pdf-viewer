import { pageRefsEqual, type DocumentHandle, type PageRef } from '@embedpdf/engine-core/runtime';

import { isDev } from './env';
import { PluginError } from './errors';
import { createEventHook, type EventHookSource } from './event-hook';
import { guardHandle } from './guarded-handle';
import { createLatestLane, type LatestLane } from './lanes';
import { createMirror, type MirrorEnvironment } from './mirror';
import { createPageMirror } from './page-mirror';
import type { Scope } from './scope';
import { createSerialQueue, type SerialQueue } from './serial-queue';
import { cancellable } from './cancellable';
import { findPage, pageOf } from './page-of';
import { permissionDenied, sessionAllows } from './permissions';
import type { Settings, SettingsStore } from './settings';
import type { SettleFlush } from './settle';
import type { SliceLease, Store } from './store';
import type {
  AnyPlugin,
  CapabilityToken,
  DocumentMeta,
  Engine,
  OperationOptions,
  PluginContext,
} from './types';
import { DocumentsToken } from './types';

/** A plugin's slice key. Workspace plugins use their id; document-scoped plugins are per-document. */
export const sliceKey = (pluginId: string, documentId?: string): string =>
  documentId ? `${pluginId}::${documentId}` : pluginId;

/**
 * The slice of a DocumentSession a context needs — structural, so this module
 * has no cycle with the kernel. Holding the session object (not its id) is
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
  readonly leases: Map<AnyPlugin, SliceLease<unknown>>;
  /** The flushes to run before the document's file is read (settle.ts). */
  readonly settleFlushes: Set<SettleFlush>;
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
  readonly workspaceLeases: Map<AnyPlugin, SliceLease<unknown>>;
  readonly report: (error: unknown) => void;
  resolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T;
  /** Total resolution (the kernel's internal rule: bring-up or ready) — what
   *  `ctx.tryGet` delegates to. Never exception-driven: a throwing capability
   *  constructor is a bug and propagates. */
  tryResolveCapability<T>(token: CapabilityToken<T>, documentId?: string): T | null;
  documentHandle(documentId?: string): DocumentHandle | null;
  /** The plugin registration's settings store, built when the plugin list was planned; undefined when it declares none. */
  settingsStoreOf(plugin: AnyPlugin): SettingsStore<object> | undefined;
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

const connectedHooks = new WeakMap<object, () => void>();

/** Kernel-side: the plugin's `connect` ran; start what waits for it (mirror loads). */
export function markConnected(context: object): void {
  connectedHooks.get(context)?.();
}

/**
 * Build the context a plugin's `create()` receives. With a `session` the
 * context is bound to that document: its state slice, `document()`, the
 * guarded `doc`, and `get()` resolving document-scoped capabilities for it.
 * `lifetime` aborts and `scope` disposes when the instance closes. One kind of
 * context serves every plugin, so `settings()` is always there and throws for
 * a plugin that declares none; the plugin's own types hide it (`definePlugin`).
 */
export function createPluginContext(
  services: ContextServices,
  plugin: AnyPlugin,
  session: SessionRef | undefined,
  lifetime: AbortSignal,
  scope: Scope,
): PluginContext<unknown, object> {
  const { engine, store } = services;
  const documentId = session?.id;
  const instanceId = session?.instanceId ?? `workspace:${plugin.id}`;
  const capability = plugin.id;
  const lease = (session?.leases ?? services.workspaceLeases).get(plugin);
  if (!lease) {
    throw new Error(
      `[kernel] no state lease for plugin "${plugin.id}" (${documentId ?? 'workspace'})`,
    );
  }

  const declared = declaredTokens(plugin);
  const guard = (token: CapabilityToken<unknown>) => {
    if (isDev() && !plugin.resolvesAnyCapability && !declared.has(token)) {
      throw new Error(
        `[kernel] plugin "${plugin.id}" resolved capability "${token.name}" without declaring it; ` +
          `add the token to its \`requires\` or \`optional\` list.`,
      );
    }
  };

  // Reported once per context: a retained callback writing into a closed
  // instance is a bug worth surfacing, not a storm worth logging.
  let reportedClosed = false;
  const reportClosed = (what: string): void => {
    if (reportedClosed) return;
    reportedClosed = true;
    services.report(
      new PluginError(
        'instance-closed',
        plugin.id,
        `${what} after the instance closed (${lease.instanceId}); dropped`,
      ),
    );
  };

  let guarded: DocumentHandle | null = null;
  const doc = (): DocumentHandle => {
    if (!session) {
      throw new Error(
        `[kernel] workspace plugin "${plugin.id}" has no bound document; use ctx.forDocument(token, documentId).`,
      );
    }
    if (!session.handle) {
      throw new PluginError(
        'not-ready',
        capability,
        `document ${session.id} has no engine handle yet`,
      );
    }
    return (guarded ??= guardHandle(session.handle, { signal: lifetime, instanceId }, capability));
  };

  const metaOf = (): DocumentMeta | null =>
    session ? (store.getCore().documents[session.id] ?? session.stagedMeta) : null;

  const notFound = (ref: PageRef) =>
    new PluginError('not-found', capability, `page ${ref.objectNumber} is not in this document`);

  const queues = new Map<string, SerialQueue>();
  const lanes = new Map<string, LatestLane>();
  let instanceSettings: Settings<object> | null = null;

  // Mirrors hold their values in store cells of their own, revoked with the
  // instance; their first load waits until the plugin is connected.
  const pendingStarts: (() => void)[] = [];
  const mirrorEnvironment = (): MirrorEnvironment => ({
    doc: doc(),
    lifetime,
    cell(name, initial) {
      const cell = store.lease(`${sliceKey(plugin.id, session?.id)}/${name}`, initial, instanceId);
      if (lifetime.aborted) cell.revoke();
      else lifetime.addEventListener('abort', () => cell.revoke(), { once: true });
      return cell;
    },
    onDocumentEvent(listener) {
      const off = doc().events.subscribe(listener);
      scope.defer(off);
    },
    report: services.report,
  });

  const context: PluginContext<unknown, object> = {
    id: plugin.id,
    instanceId,
    documentId,
    engine,
    get doc() {
      return doc();
    },
    documentHandle: (requestedDocumentId) =>
      requestedDocumentId
        ? services.documentHandle(requestedDocumentId)
        : session
          ? session.handle
          : services.documentHandle(undefined),
    document: () => {
      if (session) return metaOf();
      const id = store.getCore().activeId;
      return id ? (store.getCore().documents[id] ?? null) : null;
    },
    getPage: (page) => findPage(metaOf()?.pages ?? [], page),
    pageOf: (page) => pageOf(metaOf()?.pages ?? [], page, capability),
    assertPageRef: (ref) => {
      if (!metaOf()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, ref)))
        throw notFound(ref);
    },

    // Both read the bound document through `doc()`, so a workspace context
    // throws here exactly as reading `ctx.doc` does.
    allows: (permission) => sessionAllows(doc().security, permission),
    assertAllowed: (permission, operation) => {
      if (!sessionAllows(doc().security, permission)) {
        throw permissionDenied(capability, permission, operation);
      }
    },

    get: <T>(token: CapabilityToken<T>): T => (
      guard(token),
      services.resolveCapability(token, documentId)
    ),
    tryGet: <T>(token: CapabilityToken<T>): T | null => (
      guard(token),
      services.tryResolveCapability(token, documentId)
    ),
    forDocument: <T>(token: CapabilityToken<T>, otherDocumentId: string): T => (
      guard(token),
      services.resolveCapability(token, otherDocumentId)
    ),
    tryForDocument: <T>(token: CapabilityToken<T>, otherDocumentId: string): T | null => (
      guard(token),
      services.tryResolveCapability(token, otherDocumentId)
    ),

    state: {
      get: () => lease.read(),
      update: (transition, ...args) => {
        if (!lease.write(transition(lease.read(), ...args))) reportClosed('a state update');
      },
      onChange: lease.onChange,
    },

    settings: () => {
      if (instanceSettings) return instanceSettings;
      const registration = services.settingsStoreOf(plugin);
      if (!registration) {
        throw new Error(
          `[kernel] plugin "${plugin.id}" read ctx.settings() but declares no settings; ` +
            `add \`settings: { defaults, registered }\` to its definition.`,
        );
      }
      // The instance's own view, so its listeners go when it closes.
      return (instanceSettings = registration.forInstance((teardown) => scope.defer(teardown)));
    },

    notify: () => {
      if (lease.live) store.notify();
    },
    watch: (select, handler, isEqual = Object.is) => {
      let previous = select();
      const unsubscribe = store.subscribe(() => {
        const next = select();
        if (isEqual(previous, next)) return;
        const prior = previous;
        previous = next;
        handler(next, prior);
      });
      scope.defer(unsubscribe);
      return unsubscribe;
    },
    waitFor(predicate, options?: OperationOptions) {
      return new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (fn: () => void) => {
          if (done) return;
          done = true;
          unsubscribe();
          lifetime.removeEventListener('abort', onClose);
          options?.signal?.removeEventListener('abort', onCancel);
          fn();
        };
        const onClose = () =>
          finish(() =>
            reject(new PluginError('instance-closed', capability, 'closed while waiting')),
          );
        const onCancel = () =>
          finish(() =>
            reject(new PluginError('operation-cancelled', capability, 'cancelled while waiting')),
          );
        const check = () => {
          let holds = false;
          try {
            holds = predicate();
          } catch (error) {
            finish(() => reject(error));
            return;
          }
          if (holds) finish(resolve);
        };
        const unsubscribe = store.subscribe(check);
        if (lifetime.aborted) return onClose();
        if (options?.signal?.aborted) return onCancel();
        lifetime.addEventListener('abort', onClose, { once: true });
        options?.signal?.addEventListener('abort', onCancel, { once: true });
        check();
      });
    },

    mirror(spec) {
      const controller = createMirror(spec, mirrorEnvironment());
      pendingStarts.push(controller.start);
      return controller.mirror;
    },
    pageMirror: (spec) => createPageMirror(spec, mirrorEnvironment()),

    events: {
      source<T>(): EventHookSource<T> {
        const hook = createEventHook<T>(services.report);
        scope.defer(() => hook.dispose());
        return hook;
      },
    },
    listen(source, listener) {
      const off = typeof source === 'function' ? source(listener) : source.subscribe(listener);
      scope.defer(off);
    },

    cleanup: (teardown) => scope.defer(teardown),
    onSettle(flush) {
      if (!session) {
        throw new Error(
          `[kernel] workspace plugin "${plugin.id}" has no document to settle; ctx.onSettle() is for document-scoped plugins.`,
        );
      }
      session.settleFlushes.add(flush);
      scope.defer(() => {
        session.settleFlushes.delete(flush);
      });
    },
    async acquire(get, dispose) {
      const value = await get(lifetime);
      if (lifetime.aborted) {
        await dispose(value);
        throw new PluginError('instance-closed', capability, 'closed while acquiring a resource');
      }
      scope.defer(() => dispose(value));
      return value;
    },
    cancellable: (signal, task) => cancellable(capability, signal, task),
    latest(key) {
      let lane = lanes.get(key);
      if (!lane) {
        lane = createLatestLane(lifetime, capability, key);
        lanes.set(key, lane);
      }
      return lane;
    },
    serialQueue(key = 'default') {
      let queue = queues.get(key);
      if (!queue) {
        queue = createSerialQueue(capability);
        queues.set(key, queue);
      }
      return queue;
    },
  };
  connectedHooks.set(context, () => {
    for (const start of pendingStarts.splice(0)) start();
  });
  return context;
}
