import type { Unsubscribe } from './types';

/**
 * Subscribe-only face of a plugin event — the ONE event shape a capability
 * exposes (`onX: EventHook<XEvent>`). Events carry occurrences, never state:
 * a late subscriber that needs the current value uses a query + selector
 * instead. Payloads are plain serializable objects.
 */
export type EventHook<T> = (listener: (event: T) => void) => Unsubscribe;

/**
 * The plugin-private pair behind one capability event. Expose `.on` on the
 * capability; keep `emit`/`dispose` inside the plugin. Because the capability
 * member is the bare function type, the emitting half is unreachable through
 * the public contract by construction.
 */
export interface EventHookSource<T> {
  readonly on: EventHook<T>;
  emit(event: T): void;
  dispose(): void;
}

/**
 * Create one capability event.
 *
 * Delivery contract: synchronous fan-out over a snapshot of the listener set
 * (listeners added or removed during an emit don't affect that emit); a
 * throwing listener is isolated — reported through `onListenerError`, never
 * allowed to break the emitting operation or its sibling listeners. After
 * `dispose()`, `on` returns an inert unsubscribe (teardown races never throw).
 * No value cache, no replay, no equality — state belongs to the store.
 */
export function createEventHook<T = void>(
  onListenerError?: (error: unknown) => void,
): EventHookSource<T> {
  let listeners: Set<(event: T) => void> | null = new Set();
  return {
    on(listener) {
      if (!listeners) return () => {};
      listeners.add(listener);
      return () => void listeners?.delete(listener);
    },
    emit(event) {
      if (!listeners) return;
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          onListenerError?.(error);
        }
      }
    },
    dispose() {
      listeners = null;
    },
  };
}
