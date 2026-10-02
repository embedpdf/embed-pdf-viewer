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
export type {
  DeepPartial,
  NoSettings,
  Settings,
  SettingsApi,
  SettingsChangedEvent,
  SettingsDeclaration,
  SettingsOf,
} from './settings';
export { mergeSettings } from './settings';
export { defineState, shallowEqual } from './state';
export type { StateDeclaration } from './state';
export { documentState, documentsState } from './documents-state';
export type { DocumentsState } from './documents-state';
export { VIEWER_DEFAULTS, VIEWER_WHOLE_SETTINGS, viewerSettingsOf } from './viewer-settings';
export type { ViewerPageSettings, ViewerSettings, ViewerSettingsInput } from './viewer-settings';
export { isReadMember, returnsPromise, standInFor } from './capability-handle';
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
  // Local-only members (warmup, fonts) are reached through this check.
  isLocalEngine,
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

import type { NoSettings } from './settings';
import type { CapabilityToken, PluginDef, PromiseMembers } from './types';

/**
 * Create a typed capability token. `name` is the token's identity (debugging,
 * error messages); `options.hint` is the authored remedy the kernel appends to
 * the missing-dependency error, so the error contains its own fix.
 * `options.promises` lists the members that return a promise, so a framework
 * adapter's stand-in rejects them, rather than throwing, while no document is
 * open; a document plugin whose capability has such members gives it.
 */
export function createCapabilityToken<T>(
  name: string,
  options?: { hint?: string; promises?: PromiseMembers<T> },
): CapabilityToken<T> {
  return {
    name,
    hint: options?.hint,
    ...(options?.promises ? { promises: options.promises as Readonly<Record<string, true>> } : {}),
  };
}

/**
 * The host lens over a plugin's token: the same runtime object, typed with
 * the wider capability sibling plugins use. The one place that cast lives.
 */
export function createHostToken<Host>(token: CapabilityToken<unknown>): CapabilityToken<Host> {
  return token as CapabilityToken<Host>;
}

/**
 * Define a plugin. It returns the definition as it is, and reads the types from it, so a
 * plugin passes no type arguments: the capability from `token`, the state from `state`, the
 * settings from `settings.defaults`. `create` receives a `PluginContext<State, Settings>`
 * and must return the capability. A plugin without `state` is stateless (`void`); one
 * without `settings` has `NoSettings`, and `ctx.settings()` throws there.
 */
export function definePlugin<
  State = void,
  Capability = unknown,
  Settings extends object = NoSettings,
>(definition: PluginDef<State, Capability, Settings>): PluginDef<State, Capability, Settings> {
  return definition;
}
