import { PluginError, toPluginError } from './errors';

/**
 * What `ctx.cancellable` does: race an engine call against the caller's
 * signal. When the signal fires, the call is aborted, so the worker or the
 * server stops working on it (an `AbortablePromise`, and a call made through
 * the guarded `ctx.doc`, carry `abort()`), and the returned promise rejects
 * `operation-cancelled` at once instead of waiting for the engine to notice.
 * The guarded handle does the same for the instance's lifetime
 * (guarded-handle.ts). A signal that fires after the call settled changes
 * nothing.
 */
export function cancellable<T>(
  capability: string,
  signal: AbortSignal | undefined,
  task: Promise<T>,
): Promise<T> {
  if (!signal) return task;
  const abortable = task as Promise<T> & { abort?: (reason?: unknown) => void };
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      abortable.abort?.(signal.reason);
      reject(
        new PluginError('operation-cancelled', capability, 'operation cancelled', {
          cause: signal.reason,
        }),
      );
    };
    // Listened to even after a cancel: settling a settled promise changes
    // nothing, and the call's late rejection is then never left unhandled.
    task.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(toPluginError(capability, error));
      },
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}
