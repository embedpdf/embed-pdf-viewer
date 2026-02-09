import { Position, Rect, rectFromPoints } from '@embedpdf/models';

/**
 * Rotate a point around a center by the given angle in degrees.
 */
export function rotatePointAroundCenter(
  point: Position,
  center: Position,
  angleDegrees: number,
): Position {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Rotate an array of vertices around a center point.
 */
export function rotateVertices(
  vertices: Position[],
  center: Position,
  angleDegrees: number,
): Position[] {
  return vertices.map((v) => rotatePointAroundCenter(v, center, angleDegrees));
}

/**
 * Calculate the center of a rectangle.
 */
export function getRectCenter(rect: Rect): Position {
  return {
    x: rect.origin.x + rect.size.width / 2,
    y: rect.origin.y + rect.size.height / 2,
  };
}

/**
 * Calculate the axis-aligned bounding box for a rectangle rotated around an arbitrary point.
 */
export function calculateRotatedRectAABBAroundPoint(
  rect: Rect,
  angleDegrees: number,
  center: Position,
): Rect {
  const corners: Position[] = [
    { x: rect.origin.x, y: rect.origin.y },
    { x: rect.origin.x + rect.size.width, y: rect.origin.y },
    { x: rect.origin.x + rect.size.width, y: rect.origin.y + rect.size.height },
    { x: rect.origin.x, y: rect.origin.y + rect.size.height },
  ];
  const rotated = rotateVertices(corners, center, angleDegrees);
  return rectFromPoints(rotated);
}

/**
 * Calculate the axis-aligned bounding box for a rectangle rotated around its own center.
 */
export function calculateRotatedRectAABB(unrotatedRect: Rect, angleDegrees: number): Rect {
  return calculateRotatedRectAABBAroundPoint(
    unrotatedRect,
    angleDegrees,
    getRectCenter(unrotatedRect),
  );
}

/**
 * Infer the world-space rotation center from unrotated rect + rotated AABB + angle.
 * Falls back to the unrotated rect center when angle is effectively 0.
 */
export function inferRotationCenterFromRects(
  unrotatedRect: Rect,
  rotatedAabb: Rect,
  angleDegrees: number,
): Position {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // (I - R) becomes singular at 0deg (and full turns), where pivot is irrelevant.
  const m00 = 1 - cos;
  const m01 = sin;
  const m10 = -sin;
  const m11 = 1 - cos;
  const det = m00 * m11 - m01 * m10;

  const unrotatedCenter = getRectCenter(unrotatedRect);
  if (Math.abs(det) < 1e-10) return unrotatedCenter;

  const rotatedCenter = getRectCenter(rotatedAabb);
  const rhsX = rotatedCenter.x - (cos * unrotatedCenter.x - sin * unrotatedCenter.y);
  const rhsY = rotatedCenter.y - (sin * unrotatedCenter.x + cos * unrotatedCenter.y);

  return {
    x: (m11 * rhsX - m01 * rhsY) / det,
    y: (-m10 * rhsX + m00 * rhsY) / det,
  };
}
