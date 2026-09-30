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
  <T>(operation: () => Promise<T>): Promise<T>;
  /** Resolves once every operation queued so far has finished, however it ended. */
  idle(): Promise<void>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  const queue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return Object.assign(queue, { idle: () => tail });
}
