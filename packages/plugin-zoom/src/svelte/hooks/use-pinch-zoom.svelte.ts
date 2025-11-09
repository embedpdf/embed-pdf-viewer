import { useCapability } from '@embedpdf/core/svelte';
import type { ViewportPlugin } from '@embedpdf/plugin-viewport';
import { setupPinchZoom } from '../../shared/utils/pinch-zoom-logic';
import { useZoomCapability } from './use-zoom.svelte';

/**
 * Hook for setting up pinch-to-zoom functionality on an element
 * @param getDocumentId Function that returns the document ID
 */
export function usePinch(getDocumentId: () => string | null) {
  const viewportCapability = useCapability<ViewportPlugin>('viewport');
  const zoomCapability = useZoomCapability();

  let elementRef = $state<HTMLDivElement | null>(null);
  let cleanup: (() => void) | undefined;

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  $effect(() => {
    const element = elementRef;
    const viewport = viewportCapability.provides;
    const zoom = zoomCapability.provides;
    const docId = documentId;

    // Clean up previous setup
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }

    // Setup new pinch zoom if all dependencies are available
    if (!element || !viewport || !zoom || !docId) {
      return;
    }

    cleanup = setupPinchZoom({
      element,
      documentId: docId,
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
