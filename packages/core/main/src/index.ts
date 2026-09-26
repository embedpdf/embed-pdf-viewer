export * from './types';
export * from './kernel';
export * from './event-hook';
export * from './serial-queue';
export * from './errors';
export { composeApi } from './compose';
export type { LatestCancellation, LatestLane, LatestRun } from './lanes';
export { createLatestLane } from './lanes';
export { guardHandle } from './guarded-handle';
export { memo, memoByKey } from './memo';
export { reload } from './mirror';
export type { Mirror, MirrorChange, MirrorReload, MirrorSpec } from './mirror';
export type { PageMirror, PageMirrorChange, PageMirrorSpec } from './page-mirror';
export type { SliceChange } from './store';
export type { SliceLease } from './store';
export { CancelledError, isCancelled } from './scope';

// Re-export the engine contracts so plugins/adapters import them from @embedpdf/core.
export {
  AbortablePromise,
  CONTINUOUS_RENDER_POLICY,
  // The refusal shape of the permissions convention (permissions.md): a
  // plugin's optimistic gate rejects with the same error the engine throws.
  PermissionDenied,
  snapAppearanceScale,
  snapFullPageViewport,
  snapTileScale,
  toPageRef,
  pageRefsEqual,
  encodePageKey,
  decodePageKey,
  annotationKey,
  refFromStableId,
} from '@embedpdf/engine-core/runtime';
export type {
  EngineRenderPolicy,
  PageRef,
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

import type { CapabilityToken, PluginDef } from './types';

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

/**
 * The host lens over a plugin's token: the same runtime object, typed with
 * the wider capability sibling plugins use. The one place that cast lives.
 */
export function createHostToken<Host>(token: CapabilityToken<unknown>): CapabilityToken<Host> {
  return token as CapabilityToken<Host>;
}

/** Identity helper that pins a plugin's state and capability types. */
export function definePlugin<State, Capability>(
  definition: PluginDef<State, Capability>,
): PluginDef<State, Capability> {
  return definition;
}
