import { PluginError, toPluginError, type PluginErrorCode } from '@embedpdf/core';

/** A `PluginError` raised by the stamp plugin. */
export const stampError = (code: PluginErrorCode, message: string): PluginError =>
  new PluginError(code, 'stamp', message);

export const notFound = (what: string, id: string): PluginError =>
  stampError('not-found', `unknown ${what} '${id}'`);

/**
 * A refusal that names the missing permission. The stamp plugin acts on a
 * document it isn't bound to, so it asks that document's checks instead of
 * `ctx.assertAllowed`, and refuses with the same error.
 */
export const permissionDenied = (permission: string, operation: string): PluginError =>
  new PluginError('permission-denied', 'stamp', `${operation} requires ${permission}`, {
    permission,
  });

/** Stop before the next step, or before anything is kept, once the caller cancelled. */
export const throwIfCancelled = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new PluginError('operation-cancelled', 'stamp', 'operation cancelled', {
      cause: signal.reason,
    });
  }
};

/**
 * A capability verb: whatever the asset engine, a sibling plugin or a binary
 * source rejects with reaches the caller as a `PluginError`.
 */
export const verb =
  <Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) =>
  async (...args: Args): Promise<Result> => {
    try {
      return await run(...args);
    } catch (error) {
      throw toPluginError('stamp', error);
    }
  };
