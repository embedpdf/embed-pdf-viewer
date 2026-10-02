import { createEventHook, type EventHook } from './event-hook';
import type { CoreState, GlobalState, Unsubscribe } from './types';

/** One committed change of a slice: the value before and after. */
export interface SliceChange<S> {
  readonly next: S;
  readonly previous: S;
}

/**
 * A plugin instance's authority over its state slice. Unique per instance:
 * closing and reopening the same document id yields a new lease, and the old
 * one is revoked synchronously at the start of close, so a callback retained
 * by the old instance can never read or write the new instance's state.
 * Writes return false (and are dropped) once the lease is revoked.
 */
export interface SliceLease<S = unknown> {
  readonly key: string;
  readonly instanceId: string;
  readonly live: boolean;
  read(): S;
  /** Replace the slice's value. Writing the current value is a no-op that returns true. */
  write(next: S): boolean;
  /** Fires after every committed change of this slice, once the store's subscribers ran. */
  readonly onChange: EventHook<SliceChange<S>>;
  revoke(): void;
}

/**
 * The store: one state tree ({ core, plugins }), keyed plugin slices held by
 * leases, and one change stream (`subscribe`) that adapters and `watch` read
 * through. Slice keys are opaque strings; the kernel uses `pluginId` for
 * workspace plugins and `pluginId::docId` for document-scoped ones.
 *
 * Change notification is non-re-entrant: a change made by a listener finishes
 * the current pass and runs another, keeping listener order deterministic.
 */
export interface Store {
  /** Acquire the lease for a slice. Replaces any earlier lease under the same key (revoking it). */
  lease<S>(key: string, initial: S, instanceId?: string): SliceLease<S>;
  getCore(): CoreState;
  getState(): GlobalState;
  /** The kernel's own registry writes. */
  setCore(patch: Partial<CoreState>): void;
  /** Wake every subscriber without a state change: a resource read through a capability changed. */
  notify(): void;
  subscribe(listener: () => void): Unsubscribe;
  /** Kernel-destroy teardown: reset core, drop every slice and listener.
   *  Reads stay legal afterwards (empty state); writes become no-ops. */
  destroy(): void;
}

export function createStore(report: (error: unknown) => void = console.error): Store {
  let core: CoreState = { documents: {}, pending: {}, order: [], activeId: null };
  /** Live slice states, as adapters read them (`getState().plugins`). */
  const states: Record<string, unknown> = {};
  const leases = new Map<string, SliceLease<unknown>>();
  const changeListeners = new Set<() => void>();
  let leaseCounter = 0;

  // Per-listener isolation: one throwing subscriber (a plugin reaction, a
  // React read) must never halt the pass for its siblings, and must never
  // unwind a kernel lifecycle transition out of setCore mid-update.
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

  function lease<S>(
    key: string,
    initial: S,
    instanceId = `${key}#${++leaseCounter}`,
  ): SliceLease<S> {
    leases.get(key)?.revoke();
    const cell = { live: true, state: initial };
    const changed = createEventHook<SliceChange<S>>(report);
    states[key] = initial;
    const handle: SliceLease<S> = {
      key,
      instanceId,
      get live() {
        return cell.live;
      },
      read: () => cell.state,
      write(next) {
        if (!cell.live) return false;
        if (next === cell.state) return true;
        const previous = cell.state;
        cell.state = next;
        states[key] = next;
        emitChange();
        changed.emit({ next, previous });
        return true;
      },
      onChange: changed.on,
      revoke() {
        if (!cell.live) return;
        cell.live = false;
        changed.dispose();
        if (leases.get(key) === (handle as SliceLease<unknown>)) {
          leases.delete(key);
          delete states[key];
          emitChange();
        }
      },
    };
    leases.set(key, handle as SliceLease<unknown>);
    return handle;
  }

  return {
    lease,
    getCore: () => core,
    getState: () => ({ core, plugins: states }),
    setCore(patch) {
      core = { ...core, ...patch };
      emitChange();
    },
    notify: () => emitChange(),
    subscribe(listener) {
      changeListeners.add(listener);
      return () => void changeListeners.delete(listener);
    },
    destroy() {
      core = { documents: {}, pending: {}, order: [], activeId: null };
      for (const held of [...leases.values()]) held.revoke();
      for (const key of Object.keys(states)) delete states[key];
      changeListeners.clear();
    },
  };
}
