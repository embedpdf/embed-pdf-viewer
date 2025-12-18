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
  // This is the actual space the CSS uses for centering.
  let layoutWidth = 0;
  let layoutCenterX = 0; // Relative to the container Rect origin

  let pointerLocalY = 0;
  let pointerContainerX = 0;
  let pointerContainerY = 0;

  let currentGap = 0;
  let pivotLocalX = 0;

  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

  const calculateTransform = (scale: number) => {
    const finalWidth = initialElementWidth * scale;
    const finalHeight = initialElementHeight * scale;

    let ty = pointerLocalY * (1 - scale);

    // --- 1. Center-based Transform (The "Structural" Center) ---
    // Instead of using containerRectWidth, we use the layoutCenterX derived from Metrics.
    // layoutCenterX is the specific pixel where the content center should align.

    // Target X position relative to Container Rect Left:
    const targetX = layoutCenterX - finalWidth / 2;

    // Convert to translation (tx) relative to initial position:
    const txCenter = targetX - initialElementLeft;

    // --- 2. Mouse-based Transform ---
    const txMouse = pointerContainerX - pivotLocalX * scale - initialElementLeft;

    // --- 3. Blending ---
    // Compare finalWidth against layoutWidth (actual available space).
    const overflow = Math.max(0, finalWidth - layoutWidth);
    const blendRange = layoutWidth * 0.3;
    const blend = Math.min(1, overflow / blendRange);

    let tx = txCenter + (txMouse - txCenter) * blend;

    // --- 4. Gap-Aware Clamping ---
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
    const { tx, ty, finalWidth } = calculateTransform(currentScale);
    const delta = (currentScale - 1) * initialZoom;

    let anchorX: number;
    let anchorY: number = pointerContainerY;

    // --- CRITICAL FIX ---
    // If the content fits within the LAYOUT width (not just rect width),
    // we force the anchor to be the Layout Center.
    if (finalWidth <= layoutWidth) {
      // anchorX is relative to the Container Rect Origin (which zoomScope uses)
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

    // FETCH METRICS (Single Source of Truth)
    const metrics = viewportScope.getMetrics();

    currentGap = viewportProvides.getViewportGap() || 0;
    initialElementWidth = innerRect.width;
    initialElementHeight = innerRect.height;
    initialElementLeft = innerRect.left - contRect.origin.x;
    initialElementTop = innerRect.top - contRect.origin.y;

    containerRectWidth = contRect.size.width;
    containerRectHeight = contRect.size.height;

    // --- CLEAN LAYOUT CALCULATION ---
    // We use the viewport metrics to determine the layout geometry.
    // clientWidth: The width available for content (excludes scrollbars/borders)
    // clientLeft: The width of the left border (offset from Rect origin to Content origin)
    const clientLeft = metrics.clientLeft;

    layoutWidth = metrics.clientWidth;
    layoutCenterX = clientLeft + layoutWidth / 2;

    const rawPointerLocalX = clientX - innerRect.left;
    pointerLocalY = clientY - innerRect.top;
    pointerContainerX = clientX - contRect.origin.x;
    pointerContainerY = clientY - contRect.origin.y;

    // Pivot Calculation based on Layout Width
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
