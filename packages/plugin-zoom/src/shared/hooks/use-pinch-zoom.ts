import { useEffect, useRef } from '@framework';
import { useCapability } from '@embedpdf/core/@framework';
import { ViewportPlugin } from '@embedpdf/plugin-viewport';

import { setupPinchZoom } from '../utils/pinch-zoom-logic';
import { useZoomCapability } from './use-zoom';

export function usePinch() {
  const { provides: viewportProvides } = useCapability<ViewportPlugin>('viewport');
  const { provides: zoomProvides } = useZoomCapability();
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !viewportProvides || !zoomProvides) {
      return;
    }

    return setupPinchZoom({ element, viewportProvides, zoomProvides });
  }, [viewportProvides, zoomProvides]);

  return { elementRef };
}
