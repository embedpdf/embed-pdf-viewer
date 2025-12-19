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

  // Shared state
  let initialZoom = 0;
  let currentScale = 1;
  let isPinching = false;
  let initialDistance = 0;

  // Wheel state
  let wheelZoomTimeout: ReturnType<typeof setTimeout> | null = null;
  let accumulatedWheelScale = 1;

  // Gesture state
  let initialElementWidth = 0;
  let initialElementHeight = 0;
  let initialElementLeft = 0;
  let initialElementTop = 0;

  // Container Dimensions (Bounding Box)
  let containerRectWidth = 0;
  let containerRectHeight = 0;

  // Layout Dimensions (Client Box from Metrics)
  let layoutWidth = 0;
  let layoutCenterX = 0;

  let pointerLocalY = 0;
  let pointerContainerX = 0;
  let pointerContainerY = 0;

  let currentGap = 0;
  let pivotLocalX = 0;

  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

  // --- Margin calculation (no scroll plugin needed!) ---
  const updateMargin = () => {
    const metrics = viewportScope.getMetrics();
    const vpGap = viewportProvides.getViewportGap() || 0;
    const availableWidth = metrics.clientWidth - 2 * vpGap;

    // Use element's actual rendered width - no need for scroll plugin!
    const elementWidth = element.offsetWidth;

    const newMargin = elementWidth < availableWidth ? (availableWidth - elementWidth) / 2 : 0;

    element.style.marginLeft = `${newMargin}px`;
  };

  const calculateTransform = (scale: number) => {
    const finalWidth = initialElementWidth * scale;
    const finalHeight = initialElementHeight * scale;

    let ty = pointerLocalY * (1 - scale);

    const targetX = layoutCenterX - finalWidth / 2;
    const txCenter = targetX - initialElementLeft;
    const txMouse = pointerContainerX - pivotLocalX * scale - initialElementLeft;

    const overflow = Math.max(0, finalWidth - layoutWidth);
    const blendRange = layoutWidth * 0.3;
    const blend = Math.min(1, overflow / blendRange);

    let tx = txCenter + (txMouse - txCenter) * blend;

    const safeHeight = containerRectHeight - currentGap * 2;
    if (finalHeight > safeHeight) {
      const currentTop = initialElementTop + ty;
      const maxTop = currentGap;
      const minTop = containerRectHeight - currentGap - finalHeight;
      const constrainedTop = clamp(currentTop, minTop, maxTop);
      ty = constrainedTop - initialElementTop;
    }

    const safeWidth = containerRectWidth - currentGap * 2;
    if (finalWidth > safeWidth) {
      const currentLeft = initialElementLeft + tx;
      const maxLeft = currentGap;
      const minLeft = containerRectWidth - currentGap - finalWidth;
      const constrainedLeft = clamp(currentLeft, minLeft, maxLeft);
      tx = constrainedLeft - initialElementLeft;
    }

    return { tx, ty, blend, finalWidth };
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
    const { tx, finalWidth } = calculateTransform(currentScale);
    const delta = (currentScale - 1) * initialZoom;

    let anchorX: number;
    let anchorY: number = pointerContainerY;

    if (finalWidth <= layoutWidth) {
      anchorX = layoutCenterX;
    } else {
      const scaleDiff = 1 - currentScale;
      anchorX =
        Math.abs(scaleDiff) > 0.001 ? initialElementLeft + tx / scaleDiff : pointerContainerX;
    }

    zoomScope.requestZoomBy(delta, { vx: anchorX, vy: anchorY });
    resetTransform();
    initialZoom = 0;
  };

  const initializeGestureState = (clientX: number, clientY: number) => {
    const contRect = viewportScope.getBoundingRect();
    const innerRect = element.getBoundingClientRect();
    const metrics = viewportScope.getMetrics();

    currentGap = viewportProvides.getViewportGap() || 0;
    initialElementWidth = innerRect.width;
    initialElementHeight = innerRect.height;
    initialElementLeft = innerRect.left - contRect.origin.x;
    initialElementTop = innerRect.top - contRect.origin.y;

    containerRectWidth = contRect.size.width;
    containerRectHeight = contRect.size.height;

    const clientLeft = metrics.clientLeft;
    layoutWidth = metrics.clientWidth;
    layoutCenterX = clientLeft + layoutWidth / 2;

    const rawPointerLocalX = clientX - innerRect.left;
    pointerLocalY = clientY - innerRect.top;
    pointerContainerX = clientX - contRect.origin.x;
    pointerContainerY = clientY - contRect.origin.y;

    if (initialElementWidth < layoutWidth) {
      pivotLocalX = (pointerContainerX * initialElementWidth) / layoutWidth;
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

  // Subscribe to zoom changes to update margin
  const unsubZoom = zoomScope.onStateChange(() => updateMargin());

  // Use ResizeObserver to update margin when element size changes
  const resizeObserver = new ResizeObserver(() => updateMargin());
  resizeObserver.observe(element);

  // Initial margin calculation
  updateMargin();

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
    unsubZoom();
    resizeObserver.disconnect();
    resetTransform();
    element.style.marginLeft = '';
  };
}
