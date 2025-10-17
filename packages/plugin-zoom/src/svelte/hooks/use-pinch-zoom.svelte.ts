import type { ViewportPlugin } from '@embedpdf/plugin-viewport';
import { useZoomCapability } from './use-zoom.svelte';
import { useCapability } from '@embedpdf/core/svelte';
import { setupPinchZoom } from '../../shared/utils/pinch-zoom-logic';

export function usePinch() {
  const { provides: viewportProvides } = $derived(useCapability<ViewportPlugin>('viewport'));
  const { provides: zoomProvides } = $derived(useZoomCapability());
  const elementRef = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const element = elementRef;
    if (!element || !viewportProvides || !zoomProvides) {
      return;
    }

    return setupPinchZoom({ element, viewportProvides, zoomProvides });
  });

  return {
    get elementRef() {
      return elementRef;
    },
  };
}
