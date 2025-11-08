import type { ViewportPlugin } from '@embedpdf/plugin-viewport';
import { useZoomCapability } from './use-zoom.svelte';
import { useCapability } from '@embedpdf/core/svelte';
import { setupPinchZoom } from '../../shared/utils/pinch-zoom-logic';

export function usePinch() {
  const viewportCapability = useCapability<ViewportPlugin>('viewport');
  const zoomCapability = useZoomCapability();

  const state = $state({
    elementRef: null as HTMLDivElement | null,
  });

  $effect(() => {
    const element = state.elementRef;
    if (!element || !viewportCapability.provides || !zoomCapability.provides) {
      return;
    }

    return setupPinchZoom({
      element,
      viewportProvides: viewportCapability.provides,
      zoomProvides: zoomCapability.provides,
    });
  });

  return state;
}
