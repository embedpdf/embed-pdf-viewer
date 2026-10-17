/** The render plugin's readers: its API, its settings and its events. */
import type { EventHook } from '@embedpdf/core';
import { RenderToken } from '@embedpdf/plugin-render';
import type { RenderCapability } from '@embedpdf/plugin-render';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { settingsReader } from '../runtime/state.svelte';

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
