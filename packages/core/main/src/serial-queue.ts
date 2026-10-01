import { PluginError } from './errors';
import type { OperationOptions } from './types';

/**
 * Small promise-tail queue: operations run strictly one at a time, in
 * submission order, and failures never poison later operations. The shared
 * serializer for per-document mutation/dispatch pipelines.
 *
 * Direction law for nested queues: an operation running on queue A may
 * enqueue into queue B and await it, but never the reverse on the same pair —
 * a B-operation enqueueing back into A self-deadlocks behind its caller.
 */
export interface SerialQueue {
  /**
   * Run `operation` once everything queued before it has finished. With
   * `{ signal }`, an operation whose signal fired while it waited never
   * starts: it rejects `operation-cancelled`. Once it has started, cancelling
   * is up to the operation (`ctx.cancellable`).
   */
  <T>(operation: () => Promise<T>, options?: OperationOptions): Promise<T>;
  /** Resolves once every operation queued so far has finished, however it ended. */
  idle(): Promise<void>;
}

/** `capability` names the plugin in the error a skipped operation rejects with. */
export function createSerialQueue(capability: string): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  const queue = <T>(operation: () => Promise<T>, options?: OperationOptions): Promise<T> => {
    const start = (): Promise<T> =>
      options?.signal?.aborted
        ? Promise.reject(
            new PluginError('operation-cancelled', capability, 'cancelled before it started', {
              cause: options.signal.reason,
            }),
          )
        : operation();
    const result = tail.then(start, start);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return Object.assign(queue, { idle: () => tail });
}
