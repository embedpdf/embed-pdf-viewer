import { ref, watch, toValue, type MaybeRefOrGetter } from 'vue';
import { useCapability } from '@embedpdf/core/vue';
import type { ViewportPlugin } from '@embedpdf/plugin-viewport';

import { setupPinchZoom } from '../../shared/utils/pinch-zoom-logic';
import { useZoomCapability } from './use-zoom';

/**
 * Hook for setting up pinch-to-zoom functionality on an element
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export function usePinch(documentId: MaybeRefOrGetter<string>) {
  const { provides: viewportProvides } = useCapability<ViewportPlugin>('viewport');
  const { provides: zoomProvides } = useZoomCapability();
  const elementRef = ref<HTMLDivElement | null>(null);

  let cleanup: (() => void) | undefined;

  watch(
    [elementRef, viewportProvides, zoomProvides, () => toValue(documentId)],
    ([element, viewport, zoom, docId]) => {
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
        documentId: docId,
        viewportProvides: viewport,
        zoomProvides: zoom,
      });
    },
    { immediate: true },
  );

  return { elementRef };
}
