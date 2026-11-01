/** The render plugin's readers: its API, its settings, its events and a page's picture state. */
import type { EventHook } from '@embedpdf/core';
import { RenderToken } from '@embedpdf/plugin-render';
import type { PictureState, RenderCapability } from '@embedpdf/plugin-render';
import { usePage } from '../runtime/page';
import { useCapability, useCapabilityEvent, useOptionalSelector } from '../runtime/readers.svelte';
import { settingsReader } from '../runtime/state.svelte';
import type { CurrentValue } from '../runtime/values.svelte';

/** The render API (`renderPage`, `renderThumbnail`, invalidation, settings), for app code. */
export function useRender(): RenderCapability {
  return useCapability(RenderToken);
}

/** The render settings (`fullPage`, `tiles`, `format`, …), with or without a document. */
export const useRenderSettings = settingsReader(RenderToken);

/** Subscribe to one render event while the component lives: `useRenderEvent((render) => render.onInvalidated, handler)`. */
export function useRenderEvent<T>(
  select: (render: RenderCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(RenderToken, select, handler);
}

const NO_PICTURE: PictureState = Object.freeze({ status: 'idle', slow: false });

/**
 * Whether the picture of the page this component is drawn on is on screen in its view, as
 * `{ current }`: `{ status, slow }`. `status` is `'loading'` until it is, and `slow` turns on once
 * it waited `slowAfterMs` (400 ms): the moment to show a loading indicator. Use it in a layer of
 * the page.
 */
export function usePictureState(): CurrentValue<PictureState> {
  const page = usePage();
  return useOptionalSelector(
    RenderToken,
    (render) => render.getPictureState(page.ref, page.view),
    NO_PICTURE,
  );
}
