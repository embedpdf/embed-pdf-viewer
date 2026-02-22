/**
 * Re-export rotation geometry utilities from @embedpdf/models.
 *
 * These functions used to live here but have been promoted to the shared models
 * package so that both @embedpdf/utils (DragResizeController) and
 * @embedpdf/plugin-annotation (patches) can import from the same source.
 *
 * Existing imports from this module continue to work unchanged.
 */
export {
  rotatePointAround as rotatePointAroundCenter,
  rotateVertices,
  getRectCenter,
  calculateRotatedRectAABBAroundPoint,
  calculateRotatedRectAABB,
  inferRotationCenterFromRects,
} from '@embedpdf/models';

import type { Rect } from '@embedpdf/models';

/**
 * Convert an AABB-space rect to unrotated space.
 *
 * During group resize the pipeline works in AABB space (axis-aligned bounding
 * box), but `baseResizeScaling` expects the incoming rect in unrotated space.
 *
 * The AABB of a rect rotated by θ around its center is:
 *   AABB_w = w·|cosθ| + h·|sinθ|
 *   AABB_h = w·|sinθ| + h·|cosθ|
 *
 * This function inverts that system to recover (w, h) from the new AABB size.
 * Near 45° the system is degenerate (the AABB is always square), so we fall
 * back to uniform scaling based on the area ratio.
 *
 * @param newAABBRect - the proportionally scaled AABB rect from the group resize
 * @param originalAABBRect - the original AABB rect captured at resize start
 * @param originalUnrotatedRect - the original unrotated rect captured at resize start
 * @param rotationDegrees - the annotation's rotation in degrees
 * @returns the equivalent rect in unrotated space
 */
export function convertAABBRectToUnrotatedSpace(
  newAABBRect: Rect,
  originalAABBRect: Rect,
  originalUnrotatedRect: Rect,
  rotationDegrees: number,
): Rect {
  const theta = (rotationDegrees * Math.PI) / 180;
  const A = Math.abs(Math.cos(theta));
  const B = Math.abs(Math.sin(theta));
  const det = A * A - B * B; // cos(2θ)

  const newAABBw = newAABBRect.size.width;
  const newAABBh = newAABBRect.size.height;

  let newWidth: number;
  let newHeight: number;

  if (Math.abs(det) > 1e-6) {
    // Invert the AABB formula: solve for unrotated (w, h) from AABB (w, h)
    newWidth = (A * newAABBw - B * newAABBh) / det;
    newHeight = (A * newAABBh - B * newAABBw) / det;
    // Guard against negative values near the degenerate threshold
    newWidth = Math.max(newWidth, 1);
    newHeight = Math.max(newHeight, 1);
  } else {
    // Near 45° the AABB is always square – axis-specific scaling is undefined.
    // Fall back to uniform scaling based on area ratio.
    const origArea = originalAABBRect.size.width * originalAABBRect.size.height;
    const newArea = newAABBw * newAABBh;
    const uniformScale = origArea > 0 ? Math.sqrt(newArea / origArea) : 1;
    newWidth = originalUnrotatedRect.size.width * uniformScale;
    newHeight = originalUnrotatedRect.size.height * uniformScale;
  }

  // Center the unrotated rect at the AABB center (valid for center-based rotation)
  const newCenterX = newAABBRect.origin.x + newAABBw / 2;
  const newCenterY = newAABBRect.origin.y + newAABBh / 2;
  return {
    origin: { x: newCenterX - newWidth / 2, y: newCenterY - newHeight / 2 },
    size: { width: newWidth, height: newHeight },
  };
}
