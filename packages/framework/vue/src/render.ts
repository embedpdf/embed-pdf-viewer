/**
 * @embedpdf/vue/render: the Vue view of `@embedpdf/plugin-render`.
 * `<RenderLayer>` draws a page; `useRender()` renders pages yourself, for
 * previews and exports; `useRenderSettings()` and `useRenderEvent()` read and
 * follow the plugin; `usePictureState()` tells a layer whether its page's
 * picture is on screen.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-render';
import { RenderToken } from '@embedpdf/plugin-render';
import type { PictureState, RenderCapability } from '@embedpdf/plugin-render';
import type { EventHook } from '@embedpdf/core';
import type { Ref } from 'vue';
import { useCapability, useCapabilityEvent, useOptionalSelector } from './runtime/capabilities';
import { usePage } from './runtime/page';
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

const NO_PICTURE: PictureState = Object.freeze({ status: 'idle', slow: false });

/**
 * Whether the picture of the page this component is drawn on is on screen in its view, as a ref:
 * `{ status, slow }`. `status` is `'loading'` until it is, and `slow` turns on once it waited
 * `slowAfterMs` (400 ms): the moment to show a loading indicator. Use it in a layer of the page.
 */
export function usePictureState(): Readonly<Ref<PictureState>> {
  const page = usePage();
  return useOptionalSelector(
    RenderToken,
    (render) => render.getPictureState(page.value.ref, page.value.view),
    NO_PICTURE,
  );
}
