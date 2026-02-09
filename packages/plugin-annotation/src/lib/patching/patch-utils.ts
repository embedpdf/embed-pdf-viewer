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
import {
  calculateRotatedRectAABB,
  calculateRotatedRectAABBAroundPoint,
  getRectCenter,
  inferRotationCenterFromRects,
  rotatePointAroundCenter,
  rotateVertices,
} from '../geometry/rotation';

const EXTRA_PADDING = 1.2;

export {
  rotatePointAroundCenter,
  rotateVertices,
  getRectCenter,
  calculateRotatedRectAABB,
  calculateRotatedRectAABBAroundPoint,
};

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

/**
 * Build rect patches for vertex editing while keeping the visual rotation center stable.
 * For rotated annotations, the tight rect is kept as unrotatedRect and the AABB is
 * computed around the pre-edit center.
 */
export function resolveVertexEditRects(
  original: { rect: Rect; unrotatedRect?: Rect; rotation?: number },
  tightRect: Rect,
): { rect: Rect; unrotatedRect?: Rect } {
  if (!original.unrotatedRect) return { rect: tightRect };

  const stableCenter = resolveAnnotationRotationCenter(original);
  return {
    rect: calculateRotatedRectAABBAroundPoint(tightRect, original.rotation ?? 0, stableCenter),
    unrotatedRect: tightRect,
  };
}

/**
 * Resolve an annotation's effective rotation center in page coordinates.
 */
export function resolveAnnotationRotationCenter(original: {
  rect: Rect;
  unrotatedRect?: Rect;
  rotation?: number;
}): Position {
  if (!original.unrotatedRect) return getRectCenter(original.rect);
  return inferRotationCenterFromRects(
    original.unrotatedRect,
    original.rect,
    original.rotation ?? 0,
  );
}

/**
 * Build rotate patches while preserving an annotation's effective rotation center.
 * The incoming unrotated rect may already include a translation (group rotation/orbit).
 */
export function resolveRotateRects(
  original: { rect: Rect; unrotatedRect?: Rect; rotation?: number },
  nextUnrotatedRect: Rect,
  angleDegrees: number,
): { rect: Rect; unrotatedRect: Rect } {
  const baseCenter = resolveAnnotationRotationCenter(original);
  const translation = original.unrotatedRect
    ? {
        x: nextUnrotatedRect.origin.x - original.unrotatedRect.origin.x,
        y: nextUnrotatedRect.origin.y - original.unrotatedRect.origin.y,
      }
    : { x: 0, y: 0 };
  const nextCenter = {
    x: baseCenter.x + translation.x,
    y: baseCenter.y + translation.y,
  };

  return {
    rect: calculateRotatedRectAABBAroundPoint(nextUnrotatedRect, angleDegrees, nextCenter),
    unrotatedRect: nextUnrotatedRect,
  };
}
