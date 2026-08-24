/**
 * Resource scope — the ownership half of the lifecycle model.
 *
 * Every resource acquisition registers its release into the owning scope AT
 * the acquisition site (`scope.defer(release)` on the line after acquiring),
 * so no exit path can forget it. `dispose()` unwinds the stack LIFO, awaits
 * asynchronous teardowns, and is idempotent — every call returns the same
 * promise.
 *
 * THE rule that deletes the silent-leak bug class: a disposed scope never
 * swallows a teardown. Registering against a scope that is already disposing
 * runs the teardown as soon as the in-flight disposal finishes, instead of
 * dropping it. (Producers are still expected to stop at their next
 * cancellation checkpoint; this rule is the safety net, not the primary
 * synchronization — that's the session's operation join.)
 */

export type Teardown = () => void | Promise<void>;

/**
 * A lifecycle operation was cancelled — the tab was closed mid-open, or the
 * kernel was destroyed mid-start. NOT a failure: callers that race `open()`
 * against `close()` should treat this rejection as "the close won".
 */
export class CancelledError extends Error {
  constructor(what: string) {
    super(`[kernel] cancelled: ${what}`);
    this.name = 'CancelledError';
  }
}

export const isCancelled = (error: unknown): error is CancelledError =>
  error instanceof CancelledError;

export interface Scope {
  readonly disposed: boolean;
  defer(teardown: Teardown): void;
  dispose(): Promise<void>;
}

export function createScope(report: (error: unknown) => void): Scope {
  const teardowns: Teardown[] = [];
  let disposal: Promise<void> | null = null;

  return {
    get disposed() {
      return disposal !== null;
    },
    defer(teardown) {
      if (disposal) void disposal.then(() => Promise.resolve().then(teardown).catch(report));
      else teardowns.push(teardown);
    },
    dispose() {
      return (disposal ??= (async () => {
        while (teardowns.length) {
          try {
            await teardowns.pop()!();
          } catch (error) {
            report(error); // one failing teardown never strands the rest
          }
        }
      })());
    },
  };
}
