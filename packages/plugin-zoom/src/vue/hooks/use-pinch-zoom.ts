import { ref, onMounted, onUnmounted } from 'vue';
import { useCapability } from '@embedpdf/core/vue';
import type { ViewportPlugin } from '@embedpdf/plugin-viewport';

import { setupPinchZoom } from '../../shared/utils/pinch-zoom-logic';
import { useZoomCapability } from './use-zoom';

export function usePinch(documentId: string) {
  const { provides: viewportProvides } = useCapability<ViewportPlugin>('viewport');
  const { provides: zoomProvides } = useZoomCapability();
  const elementRef = ref<HTMLDivElement | null>(null);

  let cleanup: (() => void) | undefined;

  onMounted(async () => {
    const element = elementRef.value;
    if (!element || !viewportProvides.value || !zoomProvides.value) {
      return;
    }

    cleanup = setupPinchZoom({
      element,
      documentId,
      viewportProvides: viewportProvides.value,
      zoomProvides: zoomProvides.value,
    });
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return { elementRef };
}
