export * from './types';
export * from './kernel';
export { CancelledError, isCancelled } from './scope';

// Re-export the engine contracts so plugins/adapters import them from @embedpdf/core.
export { AbortablePromise, deferredEngine } from '@embedpdf/engine-core/runtime';
export type {
  PageHandle,
  PageRaster,
  PageRenderOptions,
  PageImageHandle,
  PageImageOptions,
  PageImageObjectUrl,
} from '@embedpdf/engine-core/runtime';

import type { Action, CapabilityToken, PluginDef } from './types';

/** Create a typed capability token. `name` is for debugging only. */
export function createCapabilityToken<T>(name: string): CapabilityToken<T> {
  return { name };
}

/** Identity helper that pins a plugin's generics. The real win is inference. */
export function definePlugin<S = unknown, A extends Action = Action, C = unknown>(
  def: PluginDef<S, A, C>,
): PluginDef<S, A, C> {
  return def;
}
