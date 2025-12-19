import { ref, watch, toValue, inject, type MaybeRefOrGetter, type Ref } from 'vue';
import { useCapability } from '@embedpdf/core/vue';
import type { ViewportPlugin, ViewportCapability } from '@embedpdf/plugin-viewport';

import { setupZoomGestures, type ZoomGestureOptions } from '../../shared/utils/zoom-gesture-logic';
import { useZoomCapability } from './use-zoom';
import type { ZoomCapability } from '../../lib/types';

export type { ZoomGestureOptions };

export interface UseZoomGestureOptions {
  /** Enable pinch-to-zoom gesture (default: true) */
  enablePinch?: MaybeRefOrGetter<boolean>;
  /** Enable wheel zoom with ctrl/cmd key (default: true) */
  enableWheel?: MaybeRefOrGetter<boolean>;
}

/**
 * Hook for setting up zoom gesture functionality (pinch and wheel zoom) on an element
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 * @param options Optional configuration for enabling/disabling gestures
 */
export function useZoomGesture(
  documentId: MaybeRefOrGetter<string>,
  options: UseZoomGestureOptions = {},
) {
  const { provides: viewportProvides } = useCapability<ViewportPlugin>('viewport');
  const { provides: zoomProvides } = useZoomCapability();
  const viewportElementRef = inject<Ref<HTMLDivElement | null> | undefined>('viewport-element');
  const elementRef = ref<HTMLDivElement | null>(null);

  let cleanup: (() => void) | undefined;

  watch(
    [
      elementRef,
      viewportProvides,
      zoomProvides,
      () => toValue(documentId),
      () => toValue(options.enablePinch ?? true),
      () => toValue(options.enableWheel ?? true),
    ],
    ([element, viewport, zoom, docId, enablePinch, enableWheel]: [
      HTMLDivElement | null,
      ViewportCapability | null,
      ZoomCapability | null,
      string,
      boolean,
      boolean,
    ]) => {
      // Clean up previous setup
      if (cleanup) {
        cleanup();
        cleanup = undefined;
      }

      const container = viewportElementRef?.value;

      // Setup new zoom gestures if all dependencies are available
      if (!element || !container || !zoom) {
        return;
      }

      cleanup = setupZoomGestures({
        element,
        container,
        documentId: docId,
        zoomProvides: zoom,
        viewportGap: viewport?.getViewportGap() || 0,
        options: { enablePinch, enableWheel },
      });
    },
    { immediate: true },
  );

  return { elementRef };
}
