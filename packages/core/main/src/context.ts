import { pageRefsEqual, type DocumentHandle, type PageRef } from '@embedpdf/engine-core/runtime';
import { pageSpace, type PageSpace } from '@embedpdf/core-geometry';

import { isDev } from './env';
import { PluginError } from './errors';
import { createEventHook, type EventHookSource } from './event-hook';
import { guardHandle } from './guarded-handle';
import { createLatestLane, type LatestLane } from './lanes';
import { createMirror, type MirrorEnvironment } from './mirror';
import { createPageMirror } from './page-mirror';
import type { Scope } from './scope';
import { createSerialQueue } from './serial-queue';
import type { SliceLease, Store } from './store';
import type {
  AnyPlugin,
  CapabilityToken,
  DocumentMeta,
  Engine,
  OperationOptions,
  PageInfo,
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
 * `lifetime` aborts and `scope` disposes when the instance closes.
 */
export function createPluginContext(
  services: ContextServices,
  plugin: AnyPlugin,
  session: SessionRef | undefined,
  lifetime: AbortSignal,
  scope: Scope,
): PluginContext<unknown> {
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

  const spaces = new Map<string, PageSpace>();
  const tryForPage = (ref: PageRef): PageSpace | null => {
    const meta = metaOf();
    const page = meta?.pages.find((pageInfo) => pageRefsEqual(pageInfo.ref, ref));
    if (!meta || !page) return null;
    const key = `${meta.revision}:${ref.pageObjectNumber}`;
    let space = spaces.get(key);
    if (!space) {
      if (spaces.size > 4096) spaces.clear();
      space = pageSpace(page.boxes.crop);
      spaces.set(key, space);
    }
    return space;
  };
  const notFound = (ref: PageRef) =>
    new PluginError(
      'not-found',
      capability,
      `page ${ref.pageObjectNumber} is not in this document`,
    );

  const queues = new Map<string, <T>(operation: () => Promise<T>) => Promise<T>>();
  const lanes = new Map<string, LatestLane>();

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

  const context: PluginContext<unknown> = {
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
    getPage: (ref): PageInfo | null =>
      metaOf()?.pages.find((pageInfo) => pageRefsEqual(pageInfo.ref, ref)) ?? null,
    assertPageRef: (ref) => {
      if (!metaOf()?.pages.some((pageInfo) => pageRefsEqual(pageInfo.ref, ref)))
        throw notFound(ref);
    },
    geometry: {
      tryForPage,
      forPage: (ref) => {
        const space = tryForPage(ref);
        if (!space) throw notFound(ref);
        return space;
      },
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
    async acquire(get, dispose) {
      const value = await get(lifetime);
      if (lifetime.aborted) {
        await dispose(value);
        throw new PluginError('instance-closed', capability, 'closed while acquiring a resource');
      }
      scope.defer(() => dispose(value));
      return value;
    },
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
        queue = createSerialQueue();
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
