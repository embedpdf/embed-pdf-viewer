import type { ViewportCapability } from '@embedpdf/plugin-viewport';
import type { ZoomCapability } from '@embedpdf/plugin-zoom';

export interface PinchZoomDeps {
  element: HTMLDivElement;
  documentId: string;
  viewportProvides: ViewportCapability;
  zoomProvides: ZoomCapability;
}

export function setupPinchZoom({
  element,
  documentId,
  viewportProvides,
  zoomProvides,
}: PinchZoomDeps) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let hammer: any | undefined;
  let initialZoom = 0;
  let lastCenter = { x: 0, y: 0 };

  const viewportScope = viewportProvides.forDocument(documentId);
  const zoomScope = zoomProvides.forDocument(documentId);

  const getState = () => zoomScope.getState();

  const updateTransform = (scale: number) => {
    element.style.transform = `scale(${scale})`;
  };

  const resetTransform = () => {
    element.style.transform = 'none';
    element.style.transformOrigin = '0 0';
  };

  const pinchStart = (e: HammerInput) => {
    initialZoom = getState().currentZoomLevel;

    const contRect = viewportScope.getBoundingRect();

    lastCenter = {
      x: e.center.x - contRect.origin.x,
      y: e.center.y - contRect.origin.y,
    };

    const innerRect = element.getBoundingClientRect();
    element.style.transformOrigin = `${e.center.x - innerRect.left}px ${e.center.y - innerRect.top}px`;

    if (e.srcEvent?.cancelable) {
      e.srcEvent.preventDefault();
      e.srcEvent.stopPropagation();
    }
  };

  const pinchMove = (e: HammerInput) => {
    updateTransform(e.scale);
    if (e.srcEvent?.cancelable) {
      e.srcEvent.preventDefault();
      e.srcEvent.stopPropagation();
    }
  };

  const pinchEnd = (e: HammerInput) => {
    const delta = (e.scale - 1) * initialZoom;
    zoomScope.requestZoomBy(delta, { vx: lastCenter.x, vy: lastCenter.y });

    resetTransform();
    initialZoom = 0;
  };

  const setupHammer = async () => {
    try {
      const Hammer = (await import('hammerjs')).default;

      const inputClass = (() => {
        const MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;
        const SUPPORT_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);
        if (SUPPORT_ONLY_TOUCH) return Hammer.TouchInput;
        if (!SUPPORT_TOUCH) return Hammer.MouseInput;
        return Hammer.TouchMouseInput;
      })();

      hammer = new Hammer(element, {
        touchAction: 'pan-x pan-y',
        inputClass,
      });

      hammer.get('pinch').set({ enable: true, pointers: 2, threshold: 0.1 });

      hammer.on('pinchstart', pinchStart);
      hammer.on('pinchmove', pinchMove);
      hammer.on('pinchend', pinchEnd);
    } catch (error) {
      console.warn('Failed to load HammerJS:', error);
    }
  };

  setupHammer();

  return () => {
    hammer?.destroy();
    resetTransform();
  };
}
