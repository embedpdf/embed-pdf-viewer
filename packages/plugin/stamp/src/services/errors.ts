import { PluginError, toPluginError, type PluginErrorCode } from '@embedpdf/core';

/** A `PluginError` raised by the stamp plugin. */
export const stampError = (code: PluginErrorCode, message: string): PluginError =>
  new PluginError(code, 'stamp', message);

export const notFound = (what: string, id: string): PluginError =>
  stampError('not-found', `unknown ${what} '${id}'`);

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
