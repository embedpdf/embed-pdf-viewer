/**
 * @embedpdf/vue/render: the Vue view of `@embedpdf/plugin-render`.
 * `<RenderLayer>` draws a page; `useRender()` renders pages yourself, for
 * previews and exports; `useRenderSettings()` and `useRenderEvent()` read and
 * follow the plugin.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-render';
import { RenderToken } from '@embedpdf/plugin-render';
import type { RenderCapability } from '@embedpdf/plugin-render';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { settingsComposable } from './state';

export { default as RenderLayer } from './render/RenderLayer.vue';

/** The render API (renderPage, renderThumbnail, invalidation, settings) for app code. The object never changes. */
export function useRender(): RenderCapability {
  return useCapability(RenderToken);
}

/** The render settings (`fullPage`, `tiles`, `format`, …), with or without a document, as refs. Takes a selector. */
export const useRenderSettings = settingsComposable(RenderToken);

/** Subscribe to one render event while the component lives: `useRenderEvent((render) => render.onInvalidated, handler)`. */
export function useRenderEvent<Event>(
  select: (render: RenderCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(RenderToken, select, handler);
}
