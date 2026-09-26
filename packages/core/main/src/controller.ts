import { pageRefsEqual, type DocumentHandle, type PageRef } from '@embedpdf/engine-core/runtime';
import { pageSpace, type PageSpace } from '@embedpdf/core-geometry';
import { createPluginContext, type ContextServices, type SessionRef } from './context';
import { createEventHook, type EventHookSource } from './event-hook';
import { PluginError } from './errors';
import { guardHandle } from './guarded-handle';
import { createLatestLane, type LatestLane } from './lanes';
import type { Scope } from './scope';
import { createSerialQueue } from './serial-queue';
import type {
  Action,
  AnyPlugin,
  ControllerContext,
  DocumentMeta,
  OperationOptions,
  PageInfo,
  Subscribable,
} from './types';

/**
 * The context a plugin's `create()` receives: the plain plugin context plus
 * the nine members the authoring pattern needs (see the road-to-3.0 plan,
 * §5.10). Everything here is bound to ONE instance's lifetime, so a
 * controller written as plain async code is lifetime-safe by construction.
 */
export function createControllerContext(
  services: ContextServices,
  plugin: AnyPlugin,
  session: SessionRef | undefined,
  lifetime: AbortSignal,
  scope: Scope,
): ControllerContext<unknown, Action> {
  const base = createPluginContext(services, plugin, session);
  const instanceId = session?.instanceId ?? `workspace:${plugin.id}`;
  const capability = plugin.id;

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
    session ? (services.store.getCore().documents[session.id] ?? session.stagedMeta) : null;

  const spaces = new Map<string, PageSpace>();
  const tryForPage = (ref: PageRef): PageSpace | null => {
    const meta = metaOf();
    const page = meta?.pages.find((p) => pageRefsEqual(p.ref, ref));
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
  const forPage = (ref: PageRef): PageSpace => {
    const space = tryForPage(ref);
    if (!space) {
      throw new PluginError(
        'not-found',
        capability,
        `page ${ref.pageObjectNumber} is not in this document`,
      );
    }
    return space;
  };

  const queues = new Map<string, <T>(operation: () => Promise<T>) => Promise<T>>();
  const lanes = new Map<string, LatestLane>();

  const context: ControllerContext<unknown, Action> = {
    ...base,
    instanceId,
    get doc() {
      return doc();
    },
    events: {
      source<T>(): EventHookSource<T> {
        const hook = createEventHook<T>(services.report);
        scope.defer(() => hook.dispose());
        return hook;
      },
    },
    geometry: { forPage, tryForPage },
    listen(source, listener) {
      const off = typeof source === 'function' ? source(listener) : source.subscribe(listener);
      scope.defer(off);
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
        const unsubscribe = services.store.subscribe(check);
        if (lifetime.aborted) return onClose();
        if (options?.signal?.aborted) return onCancel();
        lifetime.addEventListener('abort', onClose, { once: true });
        options?.signal?.addEventListener('abort', onCancel, { once: true });
        check();
      });
    },
    serialQueue(key = 'default') {
      let queue = queues.get(key);
      if (!queue) {
        queue = createSerialQueue();
        queues.set(key, queue);
      }
      return queue;
    },
    latest(key) {
      let lane = lanes.get(key);
      if (!lane) {
        lane = createLatestLane(lifetime, capability, key);
        lanes.set(key, lane);
      }
      return lane;
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
    assertPageRef(ref) {
      const meta = metaOf();
      if (!meta?.pages.some((p) => pageRefsEqual(p.ref, ref))) {
        throw new PluginError(
          'not-found',
          capability,
          `page ${ref.pageObjectNumber} is not in this document`,
        );
      }
    },
    getPage(ref): PageInfo | null {
      return metaOf()?.pages.find((p) => pageRefsEqual(p.ref, ref)) ?? null;
    },
  };
  return context;
}

export type { Subscribable };
