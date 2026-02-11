import { Rect, calculateRotatedRectAABB } from '@embedpdf/models';

import { TransformContext } from './patch-registry';
import { resolveRotateRects } from './patch-utils';

/**
 * Minimal shape required by the shared patch helpers.
 * All annotation objects satisfy this through PdfAnnotationObject.
 */
export interface RotatableAnnotation {
  rect: Rect;
  unrotatedRect?: Rect;
  rotation?: number;
}

// ---------------------------------------------------------------------------
// Rotate – identical across ALL annotation types
// ---------------------------------------------------------------------------

/**
 * Shared rotate logic.
 * Returns the full patch (rect, unrotatedRect, rotation) or `null` when the
 * context doesn't carry a rotationAngle (in which case the caller should
 * fall through to `ctx.changes`).
 */
export function baseRotateChanges(
  orig: RotatableAnnotation,
  ctx: TransformContext<any>,
): Partial<{ rect: Rect; unrotatedRect: Rect; rotation: number }> | null {
  if (ctx.metadata?.rotationAngle === undefined) return null;

  const angleDegrees = ctx.metadata.rotationAngle;
  const baseUnrotatedRect = ctx.changes.unrotatedRect ?? orig.unrotatedRect ?? orig.rect;
  const normalizedUnrotatedRect: Rect = {
    origin: { ...baseUnrotatedRect.origin },
    size: { ...baseUnrotatedRect.size },
  };

  return {
    ...resolveRotateRects(orig, normalizedUnrotatedRect, angleDegrees),
    rotation: angleDegrees,
  };
}

// ---------------------------------------------------------------------------
// Move – rect + unrotatedRect translation (callers add their own points)
// ---------------------------------------------------------------------------

/**
 * Shared move logic: computes dx/dy and translates rect + unrotatedRect.
 * Callers use the returned `dx`/`dy` to translate their own type-specific
 * data (vertices, linePoints, inkList, etc.).
 */
export function baseMoveChanges(
  orig: RotatableAnnotation,
  newRect: Rect,
): { dx: number; dy: number; rects: { rect: Rect; unrotatedRect?: Rect } } {
  const dx = newRect.origin.x - orig.rect.origin.x;
  const dy = newRect.origin.y - orig.rect.origin.y;

  const rects: { rect: Rect; unrotatedRect?: Rect } = { rect: newRect };

  if (orig.unrotatedRect) {
    rects.unrotatedRect = {
      origin: { x: orig.unrotatedRect.origin.x + dx, y: orig.unrotatedRect.origin.y + dy },
      size: { ...orig.unrotatedRect.size },
    };
  }

  return { dx, dy, rects };
}

// ---------------------------------------------------------------------------
// Resize – scale computation, min-size enforcement, aspect ratio, rect resolution
// ---------------------------------------------------------------------------

export interface ResizeScalingResult {
  /** Horizontal scale factor */
  scaleX: number;
  /** Vertical scale factor */
  scaleY: number;
  /** The old rect used as the scaling reference (unrotatedRect ?? rect) */
  oldRect: Rect;
  /** The adjusted new rect after min-size and aspect-ratio enforcement */
  resolvedRect: Rect;
  /** The final rect + unrotatedRect patches to spread into the result */
  rects: { rect: Rect; unrotatedRect?: Rect };
}

/**
 * Shared resize scaling logic:
 * 1. Determines scale factors from oldRect → newRect
 * 2. Enforces a minimum size of 10
 * 3. Optionally maintains aspect ratio
 * 4. Resolves rect vs unrotatedRect for rotated annotations
 *
 * Callers use `scaleX`, `scaleY`, `oldRect`, and `resolvedRect` to scale
 * their own type-specific data (vertices, linePoints, etc.), then spread
 * `rects` into their result.
 */
export function baseResizeScaling(
  orig: RotatableAnnotation,
  newRect: Rect,
  metadata?: { maintainAspectRatio?: boolean },
): ResizeScalingResult {
  const oldRect = orig.unrotatedRect ?? orig.rect;
  let scaleX = newRect.size.width / oldRect.size.width;
  let scaleY = newRect.size.height / oldRect.size.height;

  // Enforce minimum size to avoid collapse
  const minSize = 10;
  if (newRect.size.width < minSize || newRect.size.height < minSize) {
    scaleX = Math.max(scaleX, minSize / oldRect.size.width);
    scaleY = Math.max(scaleY, minSize / oldRect.size.height);
    newRect = {
      origin: newRect.origin,
      size: {
        width: oldRect.size.width * scaleX,
        height: oldRect.size.height * scaleY,
      },
    };
  }

  // Optional: Uniform scaling (preserve aspect ratio)
  if (metadata?.maintainAspectRatio) {
    const minScale = Math.min(scaleX, scaleY);
    scaleX = minScale;
    scaleY = minScale;
    newRect = {
      origin: newRect.origin,
      size: {
        width: oldRect.size.width * minScale,
        height: oldRect.size.height * minScale,
      },
    };
  }

  // Resolve rects: if rotated, newRect is the new unrotatedRect; compute AABB
  const rects: { rect: Rect; unrotatedRect?: Rect } = orig.unrotatedRect
    ? {
        unrotatedRect: newRect,
        rect: calculateRotatedRectAABB(newRect, orig.rotation ?? 0),
      }
    : { rect: newRect };

  return { scaleX, scaleY, oldRect, resolvedRect: newRect, rects };
}

// ---------------------------------------------------------------------------
// Rotate – orbit translation for point-based annotations
// ---------------------------------------------------------------------------

/**
 * Compute the orbit translation (dx/dy) from a rotation result.
 * Point-based annotations (line, polyline, polygon, ink) use this to
 * translate their vertices/points alongside the rect orbit during
 * group rotation. For single-annotation rotation the delta is zero.
 */
export function rotateOrbitDelta(
  orig: RotatableAnnotation,
  rotateResult: { unrotatedRect?: Rect },
): { dx: number; dy: number } {
  const baseRect = orig.unrotatedRect ?? orig.rect;
  const newRect = rotateResult.unrotatedRect ?? baseRect;
  return {
    dx: newRect.origin.x - baseRect.origin.x,
    dy: newRect.origin.y - baseRect.origin.y,
  };
}
