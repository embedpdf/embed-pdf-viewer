import type { ViewportCapability } from '@embedpdf/plugin-viewport';
import type { ZoomCapability } from '@embedpdf/plugin-zoom';

export interface PinchZoomDeps {
  element: HTMLDivElement;
  documentId: string;
  viewportProvides: ViewportCapability;
  zoomProvides: ZoomCapability;
}

function getTouchDistance(touches: TouchList): number {
  const [t1, t2] = [touches[0], touches[1]];
  const dx = t2.clientX - t1.clientX;
  const dy = t2.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touches: TouchList): { x: number; y: number } {
  const [t1, t2] = [touches[0], touches[1]];
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
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

  const viewportScope = viewportProvides.forDocument(documentId);
  const zoomScope = zoomProvides.forDocument(documentId);

  const getState = () => zoomScope.getState();

  // Shared state for gestures
  let initialZoom = 0;
  let lastCenter = { x: 0, y: 0 };
  let currentScale = 1;

  // Pinch-specific state
  let isPinching = false;
  let initialDistance = 0;

  // Wheel zoom state
  let wheelZoomTimeout: ReturnType<typeof setTimeout> | null = null;
  let accumulatedWheelScale = 1;

  // Gesture state
  let initialElementWidth = 0;
  let initialElementHeight = 0;
  let initialElementLeft = 0;
  let initialElementTop = 0;
  let containerWidth = 0;
  let containerHeight = 0;
  let pointerLocalY = 0;
  let pointerContainerX = 0;
  let pointerContainerY = 0;

  // NEW: Simple number for the gap
  let currentGap = 0;

  let pivotLocalX = 0;

  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

  const calculateTransform = (scale: number) => {
    const finalWidth = initialElementWidth * scale;
    const finalHeight = initialElementHeight * scale;

    // --- 1. Unconstrained Transforms ---
    let ty = pointerLocalY * (1 - scale);

    const txCenter = (containerWidth - finalWidth) / 2 - initialElementLeft;
    const txMouse = pointerContainerX - pivotLocalX * scale - initialElementLeft;

    const overflow = Math.max(0, finalWidth - containerWidth);
    const blendRange = containerWidth * 0.3;
    const blend = Math.min(1, overflow / blendRange);

    let tx = txCenter + (txMouse - txCenter) * blend;

    // --- 2. Gap-Aware Clamping ---
    // If the content is larger than the "Safe Area" (Container - 2 * Gap),
    // we must clamp it so it doesn't detach from the edges.

    // Vertical Clamp
    // Safe height is container minus top gap AND bottom gap
    const safeHeight = containerHeight - currentGap * 2;

    if (finalHeight > safeHeight) {
      const currentTop = initialElementTop + ty;

      // The content top cannot be lower than the gap (toolbar)
      const maxTop = currentGap;

      // The content bottom cannot be higher than the container bottom (minus gap)
      // So: Top position cannot be less than (ContainerBottom - ContentHeight)
      const minTop = containerHeight - currentGap - finalHeight;

      const constrainedTop = clamp(currentTop, minTop, maxTop);
      ty = constrainedTop - initialElementTop;
    }

    // Horizontal Clamp
    const safeWidth = containerWidth - currentGap * 2;

    if (finalWidth > safeWidth) {
      const currentLeft = initialElementLeft + tx;

      const maxLeft = currentGap;
      const minLeft = containerWidth - currentGap - finalWidth;

      const constrainedLeft = clamp(currentLeft, minLeft, maxLeft);
      tx = constrainedLeft - initialElementLeft;
    }

    return { tx, ty, blend };
  };

  const updateTransform = (scale: number) => {
    currentScale = scale;
    const { tx, ty } = calculateTransform(scale);
    element.style.transformOrigin = '0 0';
    element.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const resetTransform = () => {
    element.style.transform = 'none';
    element.style.transformOrigin = '0 0';
    currentScale = 1;
  };

  const commitZoom = () => {
    const { tx, ty } = calculateTransform(currentScale);

    const scaleDiff = 1 - currentScale;
    const anchorX =
      Math.abs(scaleDiff) > 0.001 ? initialElementLeft + tx / scaleDiff : containerWidth / 2;

    lastCenter = {
      x: anchorX,
      y: pointerContainerY,
    };

    const delta = (currentScale - 1) * initialZoom;
    zoomScope.requestZoomBy(delta, { vx: lastCenter.x, vy: lastCenter.y });
    resetTransform();
    initialZoom = 0;
  };

  const initializeGestureState = (clientX: number, clientY: number) => {
    const contRect = viewportScope.getBoundingRect();
    const innerRect = element.getBoundingClientRect();

    // NEW: Fetch the simple gap number
    currentGap = viewportProvides.getViewportGap() || 0;

    initialElementWidth = innerRect.width;
    initialElementHeight = innerRect.height;
    initialElementLeft = innerRect.left - contRect.origin.x;
    initialElementTop = innerRect.top - contRect.origin.y;
    containerWidth = contRect.size.width;
    containerHeight = contRect.size.height;

    const rawPointerLocalX = clientX - innerRect.left;
    pointerLocalY = clientY - innerRect.top;
    pointerContainerX = clientX - contRect.origin.x;
    pointerContainerY = clientY - contRect.origin.y;

    if (initialElementWidth < containerWidth) {
      pivotLocalX = (pointerContainerX * initialElementWidth) / containerWidth;
    } else {
      pivotLocalX = rawPointerLocalX;
    }
  };

  // --- Handlers ---
  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;

    isPinching = true;
    initialZoom = getState().currentZoomLevel;
    initialDistance = getTouchDistance(e.touches);

    const center = getTouchCenter(e.touches);
    initializeGestureState(center.x, center.y);

    e.preventDefault();
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPinching || e.touches.length !== 2) return;

    const currentDistance = getTouchDistance(e.touches);
    const scale = currentDistance / initialDistance;

    updateTransform(scale);
    e.preventDefault();
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (!isPinching) return;
    if (e.touches.length >= 2) return;

    isPinching = false;
    commitZoom();
  };

  const handleWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();

    if (wheelZoomTimeout === null) {
      initialZoom = getState().currentZoomLevel;
      accumulatedWheelScale = 1;
      initializeGestureState(e.clientX, e.clientY);
    } else {
      clearTimeout(wheelZoomTimeout);
    }

    const zoomFactor = 1 - e.deltaY * 0.01;
    accumulatedWheelScale *= zoomFactor;
    accumulatedWheelScale = Math.max(0.1, Math.min(10, accumulatedWheelScale));

    updateTransform(accumulatedWheelScale);

    wheelZoomTimeout = setTimeout(() => {
      wheelZoomTimeout = null;
      commitZoom();
      accumulatedWheelScale = 1;
    }, 150);
  };

  element.addEventListener('touchstart', handleTouchStart, { passive: false });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd);
  element.addEventListener('touchcancel', handleTouchEnd);
  element.addEventListener('wheel', handleWheel, { passive: false });

  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    element.removeEventListener('touchcancel', handleTouchEnd);
    element.removeEventListener('wheel', handleWheel);

    if (wheelZoomTimeout) {
      clearTimeout(wheelZoomTimeout);
    }

    resetTransform();
  };
}
