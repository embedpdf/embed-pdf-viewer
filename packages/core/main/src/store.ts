import type { Action, CoreState, GlobalState, Unsubscribe } from './types';

/**
 * A plugin instance's authority over its state slice. Unique per instance:
 * closing and reopening the same document id yields a NEW lease, and the old
 * one is revoked synchronously at the start of close — so a callback retained
 * by the old instance can never read or write the new instance's state.
 * `commit` returns false (and drops the action) once revoked.
 */
export interface SliceLease<S = unknown, A extends Action = Action> {
  readonly key: string;
  readonly instanceId: string;
  readonly live: boolean;
  read(): S;
  commit(action: A): boolean;
  revoke(): void;
}

/**
 * The store: one state tree ({ core, plugins }), keyed plugin slices held by
 * leases, and two channels — `subscribe` (state changed, for reactivity/`watch`)
 * and `subscribeAction` (an action was dispatched, for `onAction`). Slice keys
 * are opaque strings; the kernel uses `pluginId` for workspace plugins and
 * `pluginId::docId` for document-scoped ones.
 *
 * Change notification is non-re-entrant: if a listener dispatches, we finish the
 * current pass and run another — keeping listener order deterministic.
 */
export interface Store {
  /** Acquire the lease for a slice. Replaces any earlier lease under the same key (revoking it). */
  lease<S, A extends Action>(
    key: string,
    reducer: (s: S, a: A) => S,
    initial: S,
    instanceId?: string,
  ): SliceLease<S, A>;
  /** @deprecated use `lease()`; kept for the transition. */
  registerSlice(key: string, reducer: (s: unknown, a: Action) => unknown, initial: unknown): void;
  /** @deprecated revoke the lease instead; kept for the transition. */
  removeSlice(key: string): void;
  getSlice(key: string): unknown;
  getCore(): CoreState;
  getState(): GlobalState;
  dispatchTo(key: string, action: Action): void;
  setCore(patch: Partial<CoreState>, action: Action): void;
  subscribe(listener: () => void): Unsubscribe;
  subscribeAction(listener: (action: Action) => void): Unsubscribe;
  /** Kernel-destroy teardown: reset core, drop every slice/reducer/listener.
   *  Reads stay legal afterwards (empty state); writes become no-ops. */
  destroy(): void;
}

export function createStore(report: (error: unknown) => void = console.error): Store {
  let core: CoreState = { documents: {}, pending: {}, order: [], activeId: null };
  /** Live slice states, as adapters read them (`getState().plugins`). */
  const states: Record<string, unknown> = {};
  const leases = new Map<string, SliceLease<unknown, Action>>();
  const changeListeners = new Set<() => void>();
  const actionListeners = new Set<(a: Action) => void>();
  let leaseCounter = 0;

  // Per-listener isolation: one throwing subscriber (a plugin effect, a React
  // read) must never halt the pass for its siblings, and must never unwind a
  // kernel lifecycle transition out of setCore/dispatchTo mid-update.
  const guarded = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      report(error);
    }
  };

  let emitting = false;
  let pending = false;
  const emitChange = () => {
    if (emitting) {
      pending = true;
      return;
    }
    emitting = true;
    try {
      do {
        pending = false;
        changeListeners.forEach((listener) => guarded(listener));
      } while (pending);
    } finally {
      emitting = false;
    }
  };
  const emitAction = (action: Action) =>
    actionListeners.forEach((listener) => guarded(() => listener(action)));

  function lease<S, A extends Action>(
    key: string,
    reducer: (s: S, a: A) => S,
    initial: S,
    instanceId = `${key}#${++leaseCounter}`,
  ): SliceLease<S, A> {
    leases.get(key)?.revoke();
    const cell = { live: true, state: initial };
    states[key] = initial;
    const handle: SliceLease<S, A> = {
      key,
      instanceId,
      get live() {
        return cell.live;
      },
      read: () => cell.state,
      commit(action) {
        if (!cell.live) return false;
        const next = reducer(cell.state, action);
        if (next !== cell.state) {
          cell.state = next;
          states[key] = next;
          emitChange();
        }
        emitAction(action);
        return true;
      },
      revoke() {
        if (!cell.live) return;
        cell.live = false;
        if (leases.get(key) === (handle as SliceLease<unknown, Action>)) {
          leases.delete(key);
          delete states[key];
          emitChange();
        }
      },
    };
    leases.set(key, handle as SliceLease<unknown, Action>);
    return handle;
  }

  return {
    lease,
    registerSlice(key, reducer, initial) {
      lease(key, reducer, initial);
    },
    removeSlice(key) {
      leases.get(key)?.revoke();
    },
    getSlice: (key) => leases.get(key)?.read(),
    getCore: () => core,
    getState: () => ({ core, plugins: states }),
    dispatchTo(key, action) {
      leases.get(key)?.commit(action);
    },
    setCore(patch, action) {
      core = { ...core, ...patch };
      emitChange();
      emitAction(action);
    },
    subscribe(listener) {
      changeListeners.add(listener);
      return () => void changeListeners.delete(listener);
    },
    subscribeAction(listener) {
      actionListeners.add(listener);
      return () => void actionListeners.delete(listener);
    },
    destroy() {
      core = { documents: {}, pending: {}, order: [], activeId: null };
      for (const held of [...leases.values()]) held.revoke();
      for (const key of Object.keys(states)) delete states[key];
      changeListeners.clear();
      actionListeners.clear();
    },
  };
}
