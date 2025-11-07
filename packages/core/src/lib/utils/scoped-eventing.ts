import {
  EventControl,
  EventControlOptions,
  KeyedEventControl,
  isKeyedOptions,
} from './event-control';
import { EventHook, Listener, Unsubscribe } from './eventing';
import { arePropsEqual } from './math';

/* ------------------------------------------------------------------ */
/* Scoped Emitter - Generic Key-Based Event Scoping                  */
/* ------------------------------------------------------------------ */

/**
 * A scoped behavior emitter that maintains separate cached values
 * and listener sets per scope key.
 *
 * @typeParam TData - The scoped data type (without key context)
 * @typeParam TGlobalEvent - The global event type (includes key context)
 * @typeParam TKey - The key type (string, number, or both)
 */
export interface ScopedEmitter<
  TData = any,
  TGlobalEvent = { key: string; data: TData },
  TKey extends string | number = string | number,
> {
  /**
   * Emit an event for a specific scope key.
   */
  emit(key: TKey, data: TData): void;

  /**
   * Get a scoped event hook that only receives events for this key.
   */
  forScope(key: TKey): EventHook<TData>;

  /**
   * Global event hook that receives events from all scopes.
   */
  readonly onGlobal: EventHook<TGlobalEvent>;

  /**
   * Clear all scopes' caches and listeners
   */
  clear(): void;

  /**
   * Clear a specific scope's cache and listeners
   */
  clearScope(key: TKey): void;

  /**
   * Get the current cached value for a specific scope
   */
  getValue(key: TKey): TData | undefined;

  /**
   * Get all active scope keys
   */
  getScopes(): TKey[];
}

/**
 * Creates a scoped emitter with optional caching behavior.
 *
 * @param toGlobalEvent - Transform function to convert (key, data) into a global event
 * @param options - Configuration options
 * @param options.cache - Whether to cache values per scope (default: true)
 * @param options.equality - Equality function for cached values (default: arePropsEqual)
 *
 * @example
 * ```typescript
 * // With caching (stateful) - default behavior
 * const window$ = createScopedEmitter<WindowState, WindowChangeEvent, string>(
 *   (documentId, window) => ({ documentId, window })
 * );
 *
 * // Without caching (transient events)
 * const refreshPages$ = createScopedEmitter<number[], RefreshPagesEvent, string>(
 *   (documentId, pages) => ({ documentId, pages }),
 *   { cache: false }
 * );
 * ```
 */
export function createScopedEmitter<
  TData = any,
  TGlobalEvent = { key: string; data: TData },
  TKey extends string | number = string | number,
>(
  toGlobalEvent: (key: TKey, data: TData) => TGlobalEvent,
  options?: {
    cache?: boolean;
    equality?: (a: TData, b: TData) => boolean;
  },
): ScopedEmitter<TData, TGlobalEvent, TKey> {
  const shouldCache = options?.cache ?? true;
  const equality = options?.equality ?? arePropsEqual;

  // Per-scope state
  const scopeCaches = new Map<string, TData>();
  const scopeListeners = new Map<string, Set<Listener<TData>>>();
  const scopeProxyMaps = new Map<
    string,
    Map<Listener<TData>, { wrapped: Listener<TData>; destroy: () => void }>
  >();

  // Global listeners
  const globalListeners = new Set<Listener<TGlobalEvent>>();
  const globalProxyMap = new Map<
    Listener<TGlobalEvent>,
    { wrapped: Listener<TGlobalEvent>; destroy: () => void }
  >();

  const normalizeKey = (key: TKey): string => String(key);

  const getOrCreateListeners = (key: string): Set<Listener<TData>> => {
    let listeners = scopeListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      scopeListeners.set(key, listeners);
    }
    return listeners;
  };

  const getOrCreateProxyMap = (
    key: string,
  ): Map<Listener<TData>, { wrapped: Listener<TData>; destroy: () => void }> => {
    let proxyMap = scopeProxyMaps.get(key);
    if (!proxyMap) {
      proxyMap = new Map();
      scopeProxyMaps.set(key, proxyMap);
    }
    return proxyMap;
  };

  const onGlobal: EventHook<TGlobalEvent> = (
    listener: Listener<TGlobalEvent>,
    options?: EventControlOptions<TGlobalEvent>,
  ): Unsubscribe => {
    let realListener = listener;
    let destroy = () => {};

    if (options) {
      if (isKeyedOptions(options)) {
        const ctl = new KeyedEventControl(listener, options);
        realListener = ctl.handle as Listener<TGlobalEvent>;
        destroy = () => ctl.destroy();
      } else {
        const ctl = new EventControl(listener, options);
        realListener = ctl.handle as Listener<TGlobalEvent>;
        destroy = () => ctl.destroy();
      }
      globalProxyMap.set(listener, { wrapped: realListener, destroy });
    }

    globalListeners.add(realListener);

    return () => {
      globalListeners.delete(realListener);
      destroy();
      globalProxyMap.delete(listener);
    };
  };

  return {
    emit(key: TKey, data: TData) {
      const normalizedKey = normalizeKey(key);

      if (shouldCache) {
        // Behavior mode: check equality before emitting
        const cached = scopeCaches.get(normalizedKey);
        if (cached !== undefined && equality(cached, data)) {
          return; // Skip emission if value hasn't changed
        }
        scopeCaches.set(normalizedKey, data);
      }

      // Notify per-scope listeners
      const listeners = scopeListeners.get(normalizedKey);
      if (listeners) {
        listeners.forEach((l) => l(data));
      }

      // Notify global listeners
      const globalEvent = toGlobalEvent(key, data);
      globalListeners.forEach((l) => l(globalEvent));
    },

    forScope(key: TKey): EventHook<TData> {
      const normalizedKey = normalizeKey(key);

      return (listener: Listener<TData>, options?: EventControlOptions<TData>): Unsubscribe => {
        const listeners = getOrCreateListeners(normalizedKey);
        const proxyMap = getOrCreateProxyMap(normalizedKey);

        let realListener = listener;
        let destroy = () => {};

        if (options) {
          if (isKeyedOptions(options)) {
            const ctl = new KeyedEventControl(listener, options);
            realListener = ctl.handle as Listener<TData>;
            destroy = () => ctl.destroy();
          } else {
            const ctl = new EventControl(listener, options);
            realListener = ctl.handle as Listener<TData>;
            destroy = () => ctl.destroy();
          }
          proxyMap.set(listener, { wrapped: realListener, destroy });
        }

        // Replay cached value ONLY if caching is enabled
        if (shouldCache) {
          const cached = scopeCaches.get(normalizedKey);
          if (cached !== undefined) {
            realListener(cached);
          }
        }

        listeners.add(realListener);

        return () => {
          listeners.delete(realListener);
          destroy();
          proxyMap.delete(listener);

          if (listeners.size === 0) {
            scopeListeners.delete(normalizedKey);
          }
          if (proxyMap.size === 0) {
            scopeProxyMaps.delete(normalizedKey);
          }
        };
      };
    },

    onGlobal,

    getValue(key: TKey): TData | undefined {
      return shouldCache ? scopeCaches.get(normalizeKey(key)) : undefined;
    },

    getScopes(): TKey[] {
      if (shouldCache) {
        return Array.from(scopeCaches.keys()) as TKey[];
      }
      // Without cache, return all scopes that have active listeners
      return Array.from(scopeListeners.keys()) as TKey[];
    },

    clearScope(key: TKey): void {
      const normalizedKey = normalizeKey(key);

      if (shouldCache) {
        scopeCaches.delete(normalizedKey);
      }

      const listeners = scopeListeners.get(normalizedKey);
      if (listeners) {
        listeners.clear();
        scopeListeners.delete(normalizedKey);
      }

      const proxyMap = scopeProxyMaps.get(normalizedKey);
      if (proxyMap) {
        proxyMap.forEach((p) => p.destroy());
        proxyMap.clear();
        scopeProxyMaps.delete(normalizedKey);
      }
    },

    clear(): void {
      if (shouldCache) {
        scopeCaches.clear();
      }
      scopeListeners.forEach((set) => set.clear());
      scopeListeners.clear();
      scopeProxyMaps.forEach((map) => {
        map.forEach((p) => p.destroy());
        map.clear();
      });
      scopeProxyMaps.clear();

      globalListeners.clear();
      globalProxyMap.forEach((p) => p.destroy());
      globalProxyMap.clear();
    },
  };
}
