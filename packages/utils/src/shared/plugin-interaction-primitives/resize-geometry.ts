/**
 * Pure geometric functions for the resize pipeline.
 *
 * Extracted from DragResizeController so that:
 * 1. The resize math is independently testable
 * 2. The controller stays focused on state machine + coordinate transformation
 */
import { Position, Rect, rotatePointAround, calculateRotatedRectAABB } from '@embedpdf/models';

import type { ResizeHandle } from './drag-resize-controller';

// ---------------------------------------------------------------------------
// Anchor helpers
// ---------------------------------------------------------------------------

/** Anchor describes which edges stay fixed when resizing. */
export type Anchor = {
  x: 'left' | 'right' | 'center';
  y: 'top' | 'bottom' | 'center';
};

/**
 * Derive anchor from handle.
 * - 'e' means we're dragging east → left edge is anchored
 * - 'nw' means we're dragging north-west → bottom-right corner is anchored
 */
export function getAnchor(handle: ResizeHandle): Anchor {
  return {
    x: handle.includes('e') ? 'left' : handle.includes('w') ? 'right' : 'center',
    y: handle.includes('s') ? 'top' : handle.includes('n') ? 'bottom' : 'center',
  };
}

/** Get the anchor point (the visually fixed point) in page space for a given rect and anchor. */
export function getAnchorPoint(rect: Rect, anchor: Anchor): Position {
  const x =
    anchor.x === 'left'
      ? rect.origin.x
      : anchor.x === 'right'
        ? rect.origin.x + rect.size.width
        : rect.origin.x + rect.size.width / 2;
  const y =
    anchor.y === 'top'
      ? rect.origin.y
      : anchor.y === 'bottom'
        ? rect.origin.y + rect.size.height
        : rect.origin.y + rect.size.height / 2;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Constraint types
// ---------------------------------------------------------------------------

export interface ResizeConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  boundingBox?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Pipeline stages (pure functions)
// ---------------------------------------------------------------------------

/**
 * Apply the mouse delta to produce a raw (unconstrained) resized rect.
 */
export function applyResizeDelta(startRect: Rect, delta: Position, anchor: Anchor): Rect {
  let x = startRect.origin.x;
  let y = startRect.origin.y;
  let width = startRect.size.width;
  let height = startRect.size.height;

  if (anchor.x === 'left') {
    width += delta.x;
  } else if (anchor.x === 'right') {
    x += delta.x;
    width -= delta.x;
  }

  if (anchor.y === 'top') {
    height += delta.y;
  } else if (anchor.y === 'bottom') {
    y += delta.y;
    height -= delta.y;
  }

  return { origin: { x, y }, size: { width, height } };
}

/**
 * Enforce aspect ratio while respecting the anchor.
 * For edge handles (center anchor on one axis), the rect expands symmetrically on that axis.
 * For corner handles, the anchor corner stays fixed.
 */
export function enforceAspectRatio(
  rect: Rect,
  startRect: Rect,
  anchor: Anchor,
  aspectRatio: number,
): Rect {
  let { x, y } = rect.origin;
  let { width, height } = rect.size;

  const isEdgeHandle = anchor.x === 'center' || anchor.y === 'center';

  if (isEdgeHandle) {
    if (anchor.y === 'center') {
      height = width / aspectRatio;
      y = startRect.origin.y + (startRect.size.height - height) / 2;
    } else {
      width = height * aspectRatio;
      x = startRect.origin.x + (startRect.size.width - width) / 2;
    }
  } else {
    const dw = Math.abs(width - startRect.size.width);
    const dh = Math.abs(height - startRect.size.height);

    if (dw >= dh) {
      height = width / aspectRatio;
    } else {
      width = height * aspectRatio;
    }
  }

  if (anchor.x === 'right') {
    x = startRect.origin.x + startRect.size.width - width;
  }
  if (anchor.y === 'bottom') {
    y = startRect.origin.y + startRect.size.height - height;
  }

  return { origin: { x, y }, size: { width, height } };
}

/**
 * Clamp rect to bounding box while respecting anchor.
 */
export function clampToBounds(
  rect: Rect,
  startRect: Rect,
  anchor: Anchor,
  bbox: { width: number; height: number } | undefined,
  maintainAspectRatio: boolean,
): Rect {
  if (!bbox) return rect;

  let { x, y } = rect.origin;
  let { width, height } = rect.size;

  width = Math.max(1, width);
  height = Math.max(1, height);

  const anchorX =
    anchor.x === 'left' ? startRect.origin.x : startRect.origin.x + startRect.size.width;
  const anchorY =
    anchor.y === 'top' ? startRect.origin.y : startRect.origin.y + startRect.size.height;

  const maxW =
    anchor.x === 'left'
      ? bbox.width - anchorX
      : anchor.x === 'right'
        ? anchorX
        : Math.min(startRect.origin.x, bbox.width - startRect.origin.x - startRect.size.width) * 2 +
          startRect.size.width;

  const maxH =
    anchor.y === 'top'
      ? bbox.height - anchorY
      : anchor.y === 'bottom'
        ? anchorY
        : Math.min(startRect.origin.y, bbox.height - startRect.origin.y - startRect.size.height) *
            2 +
          startRect.size.height;

  if (maintainAspectRatio) {
    const scaleW = width > maxW ? maxW / width : 1;
    const scaleH = height > maxH ? maxH / height : 1;
    const scale = Math.min(scaleW, scaleH);

    if (scale < 1) {
      width *= scale;
      height *= scale;
    }
  } else {
    width = Math.min(width, maxW);
    height = Math.min(height, maxH);
  }

  if (anchor.x === 'left') {
    x = anchorX;
  } else if (anchor.x === 'right') {
    x = anchorX - width;
  } else {
    x = startRect.origin.x + (startRect.size.width - width) / 2;
  }

  if (anchor.y === 'top') {
    y = anchorY;
  } else if (anchor.y === 'bottom') {
    y = anchorY - height;
  } else {
    y = startRect.origin.y + (startRect.size.height - height) / 2;
  }

  x = Math.max(0, Math.min(x, bbox.width - width));
  y = Math.max(0, Math.min(y, bbox.height - height));

  return { origin: { x, y }, size: { width, height } };
}

/**
 * Reposition rect from current size so the start-gesture anchor remains fixed.
 * This prevents translation drift when constraints clamp width/height.
 */
export function reanchorRect(rect: Rect, startRect: Rect, anchor: Anchor): Rect {
  let x: number;
  let y: number;

  if (anchor.x === 'left') {
    x = startRect.origin.x;
  } else if (anchor.x === 'right') {
    x = startRect.origin.x + startRect.size.width - rect.size.width;
  } else {
    x = startRect.origin.x + (startRect.size.width - rect.size.width) / 2;
  }

  if (anchor.y === 'top') {
    y = startRect.origin.y;
  } else if (anchor.y === 'bottom') {
    y = startRect.origin.y + startRect.size.height - rect.size.height;
  } else {
    y = startRect.origin.y + (startRect.size.height - rect.size.height) / 2;
  }

  return { origin: { x, y }, size: rect.size };
}

/**
 * Apply min/max constraints. Also used by the drag pipeline for position clamping.
 */
export function applyConstraints(
  position: Rect,
  constraints: ResizeConstraints | undefined,
  maintainAspectRatio: boolean,
  skipBoundingClamp: boolean = false,
): Rect {
  if (!constraints) return position;

  let {
    origin: { x, y },
    size: { width, height },
  } = position;

  const minW = constraints.minWidth ?? 1;
  const minH = constraints.minHeight ?? 1;
  const maxW = constraints.maxWidth;
  const maxH = constraints.maxHeight;

  if (maintainAspectRatio && width > 0 && height > 0) {
    const ratio = width / height;

    if (width < minW) {
      width = minW;
      height = width / ratio;
    }
    if (height < minH) {
      height = minH;
      width = height * ratio;
    }

    if (maxW !== undefined && width > maxW) {
      width = maxW;
      height = width / ratio;
    }
    if (maxH !== undefined && height > maxH) {
      height = maxH;
      width = height * ratio;
    }
  } else {
    width = Math.max(minW, width);
    height = Math.max(minH, height);
    if (maxW !== undefined) width = Math.min(maxW, width);
    if (maxH !== undefined) height = Math.min(maxH, height);
  }

  if (constraints.boundingBox && !skipBoundingClamp) {
    x = Math.max(0, Math.min(x, constraints.boundingBox.width - width));
    y = Math.max(0, Math.min(y, constraints.boundingBox.height - height));
  }

  return { origin: { x, y }, size: { width, height } };
}

/**
 * Check if a rect, when rotated, fits within the given page bounds.
 */
export function isRectWithinRotatedBounds(
  rect: Rect,
  angleDegrees: number,
  bbox: { width: number; height: number },
): boolean {
  const eps = 1e-6;
  const aabb = calculateRotatedRectAABB(rect, angleDegrees);
  return (
    aabb.origin.x >= -eps &&
    aabb.origin.y >= -eps &&
    aabb.origin.x + aabb.size.width <= bbox.width + eps &&
    aabb.origin.y + aabb.size.height <= bbox.height + eps
  );
}

// ---------------------------------------------------------------------------
// Full resize pipeline
// ---------------------------------------------------------------------------

export interface ResizeConfig {
  startRect: Rect;
  maintainAspectRatio?: boolean;
  annotationRotation?: number;
  constraints?: ResizeConstraints;
}

/**
 * Run the full resize pipeline for a single step:
 * delta → anchor → raw resize → aspect ratio → bounds clamp → constraints → anchor compensation
 */
function computeResizeStep(
  delta: Position,
  handle: ResizeHandle,
  config: ResizeConfig,
  clampLocalBounds: boolean,
  skipConstraintBoundingClamp: boolean,
): Rect {
  const { startRect, maintainAspectRatio = false, annotationRotation = 0, constraints } = config;
  const anchor = getAnchor(handle);
  const aspectRatio = startRect.size.width / startRect.size.height || 1;

  // Step 1: Apply delta to get raw resize
  let rect = applyResizeDelta(startRect, delta, anchor);

  // Step 2: Enforce aspect ratio if enabled
  if (maintainAspectRatio) {
    rect = enforceAspectRatio(rect, startRect, anchor, aspectRatio);
  }

  // Step 3: Clamp in local/unrotated frame when requested
  if (clampLocalBounds) {
    rect = clampToBounds(rect, startRect, anchor, constraints?.boundingBox, maintainAspectRatio);
  }

  // Step 4: Apply min/max constraints
  rect = applyConstraints(rect, constraints, maintainAspectRatio, skipConstraintBoundingClamp);

  // In rotated resize mode we skip axis-aligned bounding clamps and solve
  // against visual bounds separately. Re-anchor after size constraints so
  // dragging past min/max does not keep translating the rect.
  if (skipConstraintBoundingClamp) {
    rect = reanchorRect(rect, startRect, anchor);
  }

  // Step 5: Compensate for visual anchor drift when the annotation is rotated.
  if (annotationRotation !== 0) {
    const anchorPt = getAnchorPoint(startRect, anchor);
    const oldCenter: Position = {
      x: startRect.origin.x + startRect.size.width / 2,
      y: startRect.origin.y + startRect.size.height / 2,
    };
    const newCenter: Position = {
      x: rect.origin.x + rect.size.width / 2,
      y: rect.origin.y + rect.size.height / 2,
    };
    const oldVisual = rotatePointAround(anchorPt, oldCenter, annotationRotation);
    const newVisual = rotatePointAround(anchorPt, newCenter, annotationRotation);
    rect = {
      origin: {
        x: rect.origin.x + (oldVisual.x - newVisual.x),
        y: rect.origin.y + (oldVisual.y - newVisual.y),
      },
      size: rect.size,
    };
  }

  return rect;
}

/**
 * Calculate the new rect after a resize operation.
 *
 * For non-rotated annotations, runs the pipeline once with local bound clamping.
 * For rotated annotations, uses a binary search to find the largest delta that
 * keeps the visual AABB within page bounds.
 */
export function computeResizedRect(
  delta: Position,
  handle: ResizeHandle,
  config: ResizeConfig,
): Rect {
  const { annotationRotation = 0, constraints } = config;
  const bbox = constraints?.boundingBox;

  // For rotated annotations, clamp using visual AABB bounds via binary search.
  if (annotationRotation !== 0 && bbox) {
    const target = computeResizeStep(delta, handle, config, false, true);
    if (isRectWithinRotatedBounds(target, annotationRotation, bbox)) {
      return target;
    }

    let best = computeResizeStep({ x: 0, y: 0 }, handle, config, false, true);
    let low = 0;
    let high = 1;
    for (let i = 0; i < 20; i += 1) {
      const mid = (low + high) / 2;
      const trial = computeResizeStep(
        { x: delta.x * mid, y: delta.y * mid },
        handle,
        config,
        false,
        true,
      );
      if (isRectWithinRotatedBounds(trial, annotationRotation, bbox)) {
        best = trial;
        low = mid;
      } else {
        high = mid;
      }
    }

    return best;
  }

  return computeResizeStep(delta, handle, config, true, false);
}
