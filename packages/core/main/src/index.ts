export * from './types';
export * from './kernel';
export { CancelledError, isCancelled } from './scope';

// Re-export the engine contracts so plugins/adapters import them from @embedpdf/core.
export {
  AbortablePromise,
  CONTINUOUS_RENDER_POLICY,
  // The refusal shape of the permissions convention (permissions.md): a
  // plugin's optimistic gate rejects with the SAME error the engine throws.
  PermissionDenied,
  snapAppearanceScale,
  snapFullPageViewport,
  snapTileScale,
} from '@embedpdf/engine-core/runtime';
export type {
  EngineRenderPolicy,
  PageHandle,
  PageRaster,
  PageRenderOptions,
  PageRenderTarget,
  PageRenderViewport,
  PageImageHandle,
  PageImageOptions,
  PageImageObjectUrl,
  PdfRect,
} from '@embedpdf/engine-core/runtime';

import type { Action, CapabilityToken, PluginDef } from './types';

/**
 * Create a typed capability token. `name` is the token's identity (debugging,
 * error messages); `options.hint` is the authored remedy the kernel appends to
 * the missing-dependency error, so the error contains its own fix.
 */
export function createCapabilityToken<T>(
  name: string,
  options?: { hint?: string },
): CapabilityToken<T> {
  return { name, hint: options?.hint };
}

/** Identity helper that pins a plugin's generics. The real win is inference. */
export function definePlugin<S = unknown, A extends Action = Action, C = unknown>(
  def: PluginDef<S, A, C>,
): PluginDef<S, A, C> {
  return def;
}
