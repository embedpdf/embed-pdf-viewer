import {
  calculateRotatedRectAABBAroundPoint,
  getQuadBaselineAngleDegrees,
  getQuadBaselineEnd,
  getQuadInkExtent,
  getRectBottomCenter,
  Quad,
  Rect,
  rectToQuad,
} from '@embedpdf/models';

export interface CaretGeometry {
  rect: Rect;
  unrotatedRect?: Rect;
  rotation?: number;
}

/**
 * Compute caret annotation geometry at the end of a text selection.
 * Uses oriented segment quads for size, anchor, and rotation on rotated pages.
 */
export function computeCaretGeometry(lastSegRect: Rect, lastSegQuad?: Quad): CaretGeometry {
  const quad = lastSegQuad ?? rectToQuad(lastSegRect);
  const baselineEnd = getQuadBaselineEnd(quad);
  const inkExtent = getQuadInkExtent(quad);
  const size = Math.max(inkExtent / 2, 0.5);
  const rotation = getQuadBaselineAngleDegrees(quad);

  const unrotatedRect: Rect = {
    origin: {
      x: baselineEnd.x - size / 2,
      y: baselineEnd.y - size,
    },
    size: { width: size, height: size },
  };

  if (Math.abs(rotation) < 1e-6 || Math.abs(Math.abs(rotation) - 360) < 1e-6) {
    return { rect: unrotatedRect };
  }

  const pivot = getRectBottomCenter(unrotatedRect);
  const rect = calculateRotatedRectAABBAroundPoint(unrotatedRect, rotation, pivot);

  return {
    rect,
    unrotatedRect,
    rotation,
  };
}

/**
 * @deprecated Use {@link computeCaretGeometry} for oriented caret placement.
 */
export function computeCaretRect(lastSegRect: Rect, lastSegQuad?: Quad): Rect {
  return computeCaretGeometry(lastSegRect, lastSegQuad).rect;
}
