import { useCapability } from '@embedpdf/core/svelte';
import type { ViewportPlugin } from '@embedpdf/plugin-viewport';
import { setupPinchZoom } from '../../shared/utils/pinch-zoom-logic';
import { useZoomCapability } from './use-zoom.svelte';

/**
 * Hook for setting up pinch-to-zoom functionality on an element
 * @param documentId Document ID
 */
export function usePinch(documentId: string) {
  const viewportCapability = useCapability<ViewportPlugin>('viewport');
  const zoomCapability = useZoomCapability();

  let elementRef = $state<HTMLDivElement | null>(null);
  let cleanup: (() => void) | undefined;

  $effect(() => {
    const element = elementRef;
    const viewport = viewportCapability.provides;
    const zoom = zoomCapability.provides;

    // Clean up previous setup
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }

    // Setup new pinch zoom if all dependencies are available
    if (!element || !viewport || !zoom) {
      return;
    }

    cleanup = setupPinchZoom({
      element,
      documentId,
      viewportProvides: viewport,
      zoomProvides: zoom,
    });

    return () => {
      if (cleanup) {
        cleanup();
        cleanup = undefined;
      }
    };
  });

  return {
    get elementRef() {
      return elementRef;
    },
    set elementRef(value: HTMLDivElement | null) {
      elementRef = value;
    },
  };
}
