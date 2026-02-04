import { useLayoutEffect, useRef } from '@framework';
import { useCapability } from '@embedpdf/core/@framework';
import { ViewportPlugin, useViewportElement } from '@embedpdf/plugin-viewport/@framework';
import { setupZoomGestures, ZoomGestureOptions } from '../utils/pinch-zoom-logic';
import { useZoomCapability } from './use-zoom';

export type { ZoomGestureOptions };

export function useZoomGesture(documentId: string, options: ZoomGestureOptions = {}) {
  const { provides: viewportProvides } = useCapability<ViewportPlugin>('viewport');
  const { provides: zoomProvides } = useZoomCapability();
  const viewportElementRef = useViewportElement();
  const elementRef = useRef<HTMLDivElement>(null);

  // Use useLayoutEffect to set up zoom gestures synchronously before paint
  // This prevents flashing and layout jumps that occur with useEffect
  useLayoutEffect(() => {
    const element = elementRef.current;
    const container = viewportElementRef?.current;

    if (!element || !viewportProvides || !zoomProvides) {
      return;
    }
    return setupZoomGestures({
      element,
      container: container || undefined,
      documentId,
      viewportProvides,
      zoomProvides,
      options,
    });
  }, [
    viewportProvides,
    zoomProvides,
    documentId,
    viewportElementRef,
    options.enablePinch,
    options.enableWheel,
  ]);

  return { elementRef };
}
