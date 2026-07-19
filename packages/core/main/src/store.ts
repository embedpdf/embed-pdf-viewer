import type { Action, CoreState, GlobalState, Unsubscribe } from './types';

/**
 * The store: one state tree ({ core, plugins }), keyed plugin slices, and two
 * channels — `subscribe` (state changed, for reactivity/`watch`) and
 * `subscribeAction` (an action was dispatched, for `onAction`). Slice keys are
 * opaque strings; the kernel uses `pluginId` for workspace plugins and
 * `pluginId::docId` for document-scoped ones.
 *
 * Change notification is non-re-entrant: if a listener dispatches, we finish the
 * current pass and run another — keeping listener order deterministic.
 */
export interface Store {
  registerSlice(key: string, reducer: (s: unknown, a: Action) => unknown, initial: unknown): void;
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
  const slices: Record<string, unknown> = {};
  const reducers: Record<string, (s: unknown, a: Action) => unknown> = {};
  const changeListeners = new Set<() => void>();
  const actionListeners = new Set<(a: Action) => void>();

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

  return {
    registerSlice(key, reducer, initial) {
      reducers[key] = reducer;
      slices[key] = initial;
    },
    removeSlice(key) {
      delete reducers[key];
      delete slices[key];
      emitChange();
    },
    getSlice: (key) => slices[key],
    getCore: () => core,
    getState: () => ({ core, plugins: slices }),
    dispatchTo(key, action) {
      const r = reducers[key];
      if (!r) return;
      const next = r(slices[key], action);
      if (next !== slices[key]) {
        slices[key] = next;
        emitChange();
      }
      emitAction(action);
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
      for (const key of Object.keys(slices)) delete slices[key];
      for (const key of Object.keys(reducers)) delete reducers[key];
      changeListeners.clear();
      actionListeners.clear();
    },
  };
}
