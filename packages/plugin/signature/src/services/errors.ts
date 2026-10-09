import { toPluginError } from '@embedpdf/core';

/**
 * A capability verb: whatever the engine, a signer port or the validator
 * rejects with reaches the caller as a `PluginError`.
 */
export const verb =
  <Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) =>
  async (...args: Args): Promise<Result> => {
    try {
      return await run(...args);
    } catch (error) {
      throw toPluginError('signature', error);
    }
  };
