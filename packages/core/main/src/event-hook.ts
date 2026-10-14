import type { Unsubscribe } from './types';

/**
 * Subscribe-only face of a plugin event — the one event shape a capability
 * exposes (`onX: EventHook<XEvent>`). Events carry occurrences, never state:
 * a late subscriber that needs the current value uses a query + selector
 * instead. Payloads are plain serializable objects.
 */
export type EventHook<T> = (
  listener: (event: T) => void,
  options?: { signal?: AbortSignal },
) => Unsubscribe;

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
 * Subscribe with `{ signal }` to tie the subscription to an AbortSignal; a
 * pre-aborted signal never registers.
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
    on(listener, options) {
      if (!listeners || options?.signal?.aborted) return () => {};
      listeners.add(listener);
      const off = () => void listeners?.delete(listener);
      // An AbortSignal is the framework-neutral lifetime: one controller can
      // end many subscriptions (rule 8 of the contract).
      options?.signal?.addEventListener('abort', off, { once: true });
      return off;
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
