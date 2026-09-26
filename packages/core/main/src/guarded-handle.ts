import type { DocumentHandle } from '@embedpdf/engine-core/runtime';
import { PluginError, toPluginError } from './errors';

/** What the guard needs to know about the instance it protects. */
export interface GuardedLifetime {
  /** Aborted when the instance closes (a document session) or the kernel is destroyed. */
  readonly signal: AbortSignal;
  readonly instanceId: string;
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof (value as { then?: unknown }).then === 'function';

const isPlainWrappable = (value: unknown): value is object =>
  value !== null &&
  typeof value === 'object' &&
  !isPromiseLike(value) &&
  !(value instanceof ArrayBuffer) &&
  !ArrayBuffer.isView(value) &&
  !(value instanceof Date) &&
  !(value instanceof RegExp) &&
  !(value instanceof Map) &&
  !(value instanceof Set) &&
  !Array.isArray(value);

/**
 * The guarded document handle a controller sees as `ctx.doc`. Every call made
 * through it is:
 *
 *   - refused (rejected `instance-closed`) once the instance has closed,
 *   - raced against the instance lifetime: a call that is still pending when
 *     the instance closes rejects `instance-closed`, its late value is dropped,
 *     and an abortable engine call is aborted so worker-side work stops,
 *   - mapped through `toPluginError`, so a controller sees one error vocabulary.
 *
 * Nested service objects (`doc.annotations`, `doc.page(ref).render`) are
 * wrapped lazily and cached; synchronous reads (`doc.security.allows`) pass
 * straight through. Methods run with the raw target as `this`, so classes
 * with private fields keep working. The returned promises keep an `abort()`
 * when the engine's promise had one, so caller-side cancellation still works.
 */
export function guardHandle(
  handle: DocumentHandle,
  lifetime: GuardedLifetime,
  capability: string,
): DocumentHandle {
  const cache = new WeakMap<object, object>();

  const closedError = () =>
    new PluginError(
      'instance-closed',
      capability,
      `document instance ${lifetime.instanceId} was closed`,
    );

  const guardPromise = <T>(pending: PromiseLike<T>): Promise<T> => {
    const abortable = pending as PromiseLike<T> & { abort?: (reason?: unknown) => void };
    const guarded = new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        abortable.abort?.(lifetime.signal.reason);
        reject(closedError());
      };
      if (lifetime.signal.aborted) {
        onAbort();
      } else {
        lifetime.signal.addEventListener('abort', onAbort, { once: true });
      }
      Promise.resolve(pending).then(
        (value) => {
          lifetime.signal.removeEventListener('abort', onAbort);
          if (!lifetime.signal.aborted) resolve(value);
        },
        (error) => {
          lifetime.signal.removeEventListener('abort', onAbort);
          if (!lifetime.signal.aborted) reject(toPluginError(capability, error));
        },
      );
    });
    if (typeof abortable.abort === 'function') {
      Object.defineProperty(guarded, 'abort', {
        value: (reason?: unknown) => abortable.abort!(reason),
        enumerable: false,
      });
    }
    return guarded;
  };

  const wrapFunction = (fn: (...args: unknown[]) => unknown, target: object) =>
    function guardedCall(...args: unknown[]): unknown {
      let result: unknown;
      try {
        result = fn.apply(target, args);
      } catch (error) {
        throw toPluginError(capability, error);
      }
      if (isPromiseLike(result)) return guardPromise(result);
      return wrapValue(result, target);
    };

  const wrapValue = (value: unknown, target: object): unknown => {
    if (typeof value === 'function')
      return wrapFunction(value as (...args: unknown[]) => unknown, target);
    if (isPlainWrappable(value)) return wrapObject(value);
    return value;
  };

  const wrapObject = (target: object): object => {
    let proxy = cache.get(target);
    if (!proxy) {
      proxy = new Proxy(target, {
        get(t, property) {
          return wrapValue(Reflect.get(t, property, t), t);
        },
      });
      cache.set(target, proxy);
    }
    return proxy;
  };

  return wrapObject(handle) as DocumentHandle;
}
