import {
  Rect,
  Position,
  LineEndings,
  PdfAnnotationLineEnding,
  rotateAndTranslatePoint,
  rectFromPoints,
  expandRect,
} from '@embedpdf/models';
import { LINE_ENDING_HANDLERS } from './line-ending-handlers';

const EXTRA_PADDING = 1.2;

/**
 * Rotate a point around a center by the given angle in degrees.
 * @param point - The point to rotate
 * @param center - The center of rotation
 * @param angleDegrees - Rotation angle in degrees (clockwise)
 * @returns The rotated point
 */
export function rotatePointAroundCenter(
  point: Position,
  center: Position,
  angleDegrees: number,
): Position {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Translate point to origin, rotate, then translate back
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Rotate an array of vertices around a center point.
 * @param vertices - Array of points to rotate
 * @param center - Center of rotation
 * @param angleDegrees - Rotation angle in degrees (clockwise)
 * @returns Array of rotated points
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
 * @param rect - The rectangle
 * @returns The center point
 */
export function getRectCenter(rect: Rect): Position {
  return {
    x: rect.origin.x + rect.size.width / 2,
    y: rect.origin.y + rect.size.height / 2,
  };
}

/**
 * Calculate the axis-aligned bounding box for rotated vertices.
 * @param vertices - The rotated vertices
 * @param padding - Optional padding to add around the bounding box
 * @returns The axis-aligned bounding box
 */
export function calculateAABBFromVertices(vertices: Position[], padding: number = 0): Rect {
  if (vertices.length === 0) {
    return { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
  }

  const baseRect = rectFromPoints(vertices);
  return padding > 0 ? expandRect(baseRect, padding) : baseRect;
}

/**
 * Calculate the axis-aligned bounding box for a rotated rectangle.
 * This is used for simple shape annotations (circle, square) that store rotation.
 * @param unrotatedRect - The original unrotated rectangle
 * @param angleDegrees - Rotation angle in degrees
 * @returns The axis-aligned bounding box after rotation
 */
export function calculateRotatedRectAABB(unrotatedRect: Rect, angleDegrees: number): Rect {
  const center = getRectCenter(unrotatedRect);

  // Get the four corners of the unrotated rect
  const corners: Position[] = [
    { x: unrotatedRect.origin.x, y: unrotatedRect.origin.y }, // top-left
    { x: unrotatedRect.origin.x + unrotatedRect.size.width, y: unrotatedRect.origin.y }, // top-right
    {
      x: unrotatedRect.origin.x + unrotatedRect.size.width,
      y: unrotatedRect.origin.y + unrotatedRect.size.height,
    }, // bottom-right
    { x: unrotatedRect.origin.x, y: unrotatedRect.origin.y + unrotatedRect.size.height }, // bottom-left
  ];

  // Rotate corners
  const rotatedCorners = rotateVertices(corners, center, angleDegrees);

  // Calculate AABB
  return rectFromPoints(rotatedCorners);
}

/**
 * Computes the exact bounding box for a line or polyline, including its endings and stroke width.
 * This function uses the central `LINE_ENDING_HANDLERS` to ensure calculations are
 * perfectly in sync with the rendering logic.
 */
export function lineRectWithEndings(
  vertices: Position[],
  strokeWidth: number,
  endings: LineEndings | undefined,
): Rect {
  if (!vertices || vertices.length === 0) {
    return { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
  }

  const allPoints: Position[] = [...vertices];
  const toAngle = (a: Position, b: Position) => Math.atan2(b.y - a.y, b.x - a.x);

  const processEnding = (
    endingType: PdfAnnotationLineEnding | undefined,
    tipPos: Position,
    segmentAngle: number,
  ) => {
    if (!endingType) return;

    const handler = LINE_ENDING_HANDLERS[endingType];
    if (!handler) return;

    const localPts = handler.getLocalPoints(strokeWidth);
    const rotationAngle = handler.getRotation(segmentAngle);

    const transformedPts = localPts.map((p) => rotateAndTranslatePoint(p, rotationAngle, tipPos));
    allPoints.push(...transformedPts);
  };

  if (vertices.length >= 2) {
    // Process start ending. Angle points from the second vertex INTO the first.
    const startAngle = toAngle(vertices[1], vertices[0]);
    processEnding(endings?.start, vertices[0], startAngle);

    // Process end ending. Angle points from the second-to-last vertex INTO the last.
    const lastIdx = vertices.length - 1;
    const endAngle = toAngle(vertices[lastIdx - 1], vertices[lastIdx]);
    processEnding(endings?.end, vertices[lastIdx], endAngle);
  }

  if (allPoints.length <= 1) {
    const point = vertices[0] || { x: 0, y: 0 };
    const pad = strokeWidth;
    return {
      origin: { x: point.x - pad, y: point.y - pad },
      size: { width: pad * 2, height: pad * 2 },
    };
  }

  const baseRect = rectFromPoints(allPoints);
  const pad = strokeWidth / 2 + EXTRA_PADDING * strokeWidth;
  return expandRect(baseRect, pad);
}
