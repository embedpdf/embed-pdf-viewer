import {
  Rect,
  Position,
  LineEndings,
  PdfAnnotationLineEnding,
  PdfRectDifferences,
  PdfFreeTextAnnoObject,
  rotateAndTranslatePoint,
  rectFromPoints,
  expandRect,
  getRectCenter,
  rotatePointAround,
  rotateVertices,
  calculateRotatedRectAABB,
  calculateRotatedRectAABBAroundPoint,
  inferRotationCenterFromRects,
} from '@embedpdf/models';

import { LINE_ENDING_HANDLERS } from './line-ending-handlers';

const EXTRA_PADDING = 1.2;

// Re-export for downstream consumers that import from patch-utils
export {
  rotatePointAround as rotatePointAroundCenter,
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
 * Build rect patches for vertex editing.
 * For rotated annotations, the tight rect is kept as unrotatedRect and the AABB is
 * computed around the new content center so rotation UI follows the edited geometry.
 */
export function resolveVertexEditRects(
  original: { rect: Rect; unrotatedRect?: Rect; rotation?: number },
  tightRect: Rect,
): { rect: Rect; unrotatedRect?: Rect } {
  if (!original.unrotatedRect) return { rect: tightRect };

  const center = getRectCenter(tightRect);
  return {
    rect: calculateRotatedRectAABBAroundPoint(tightRect, original.rotation ?? 0, center),
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
  const baseRect = original.unrotatedRect ?? original.rect;
  const translation = {
    x: nextUnrotatedRect.origin.x - baseRect.origin.x,
    y: nextUnrotatedRect.origin.y - baseRect.origin.y,
  };
  const nextCenter = {
    x: baseCenter.x + translation.x,
    y: baseCenter.y + translation.y,
  };

  return {
    rect: calculateRotatedRectAABBAroundPoint(nextUnrotatedRect, angleDegrees, nextCenter),
    unrotatedRect: nextUnrotatedRect,
  };
}

/**
 * Compensate vertices for rotated vertex editing so the dragged point tracks the cursor
 * while the rotation center follows edited geometry.
 *
 * Without this compensation, changing the tight bounds center during a rotated vertex edit
 * applies an additional translation to all points, which appears as opposite-end drift.
 */
export function compensateRotatedVertexEdit(
  original: { rect: Rect; unrotatedRect?: Rect; rotation?: number },
  vertices: Position[],
  tightRect: Rect,
): Position[] {
  if (!original.unrotatedRect) return vertices;

  const angle = original.rotation ?? 0;
  if (Math.abs(angle % 360) < 1e-8) return vertices;

  const baseCenter = resolveAnnotationRotationCenter(original);
  const nextCenter = getRectCenter(tightRect);

  // q = (I - R) * (baseCenter - nextCenter)
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = baseCenter.x - nextCenter.x;
  const dy = baseCenter.y - nextCenter.y;

  const qx = (1 - cos) * dx + sin * dy;
  const qy = -sin * dx + (1 - cos) * dy;
  if (Math.abs(qx) < 1e-8 && Math.abs(qy) < 1e-8) return vertices;

  return vertices.map((v) => ({ x: v.x + qx, y: v.y + qy }));
}

// ---------------------------------------------------------------------------
// Callout FreeText helpers
// ---------------------------------------------------------------------------

/**
 * Derive the text box rect from the annotation's overall rect and RD inset.
 */
export function computeTextBoxFromRD(rect: Rect, rd: PdfRectDifferences | undefined): Rect {
  if (!rd) return rect;
  return {
    origin: { x: rect.origin.x + rd.left, y: rect.origin.y + rd.top },
    size: {
      width: Math.max(0, rect.size.width - rd.left - rd.right),
      height: Math.max(0, rect.size.height - rd.top - rd.bottom),
    },
  };
}

/**
 * Compute the RD inset from the overall rect to the text box.
 */
export function computeRDFromTextBox(overallRect: Rect, textBox: Rect): PdfRectDifferences {
  return {
    left: textBox.origin.x - overallRect.origin.x,
    top: textBox.origin.y - overallRect.origin.y,
    right: overallRect.origin.x + overallRect.size.width - (textBox.origin.x + textBox.size.width),
    bottom:
      overallRect.origin.y + overallRect.size.height - (textBox.origin.y + textBox.size.height),
  };
}

/**
 * Auto-compute the callout connection point on the text box edge.
 * Uses the knee's position relative to the text box center, scaled by aspect ratio,
 * to choose the nearest edge midpoint (top, right, bottom, left).
 */
export function computeCalloutConnectionPoint(knee: Position, textBox: Rect): Position {
  const cx = textBox.origin.x + textBox.size.width / 2;
  const cy = textBox.origin.y + textBox.size.height / 2;
  const dx = knee.x - cx;
  const dy = knee.y - cy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontally dominant → left or right
    return dx > 0
      ? { x: textBox.origin.x + textBox.size.width, y: cy }
      : { x: textBox.origin.x, y: cy };
  }
  // Vertically dominant → top or bottom
  return dy > 0
    ? { x: cx, y: textBox.origin.y + textBox.size.height }
    : { x: cx, y: textBox.origin.y };
}

/**
 * Compute the overall bounding rect for a callout FreeText, encompassing
 * the text box, callout line, and line ending geometry.
 *
 * The text box border grows inward (stroke outer edge = textBox boundary),
 * so no outward padding is added for the text box. The callout line and
 * arrow stroke extend outward and miter joins at the knee can protrude
 * further, so they get strokeWidth padding (half for stroke + half for
 * miter/join clearance).
 */
export function computeCalloutOverallRect(
  textBox: Rect,
  calloutLine: Position[],
  lineEnding: PdfAnnotationLineEnding | undefined,
  strokeWidth: number,
): Rect {
  const linePoints = [...calloutLine];

  if (lineEnding && calloutLine.length >= 2) {
    const handler = LINE_ENDING_HANDLERS[lineEnding];
    if (handler) {
      const angle = Math.atan2(
        calloutLine[1].y - calloutLine[0].y,
        calloutLine[1].x - calloutLine[0].x,
      );
      const localPts = handler.getLocalPoints(strokeWidth);
      const rotationAngle = handler.getRotation(angle + Math.PI);
      const transformed = localPts.map((p) =>
        rotateAndTranslatePoint(p, rotationAngle, calloutLine[0]),
      );
      linePoints.push(...transformed);
    }
  }

  const lineBbox = expandRect(rectFromPoints(linePoints), strokeWidth);

  const tbRight = textBox.origin.x + textBox.size.width;
  const tbBottom = textBox.origin.y + textBox.size.height;
  const lnRight = lineBbox.origin.x + lineBbox.size.width;
  const lnBottom = lineBbox.origin.y + lineBbox.size.height;

  const minX = Math.min(textBox.origin.x, lineBbox.origin.x);
  const minY = Math.min(textBox.origin.y, lineBbox.origin.y);
  const maxX = Math.max(tbRight, lnRight);
  const maxY = Math.max(tbBottom, lnBottom);

  return {
    origin: { x: minX, y: minY },
    size: { width: maxX - minX, height: maxY - minY },
  };
}

export const calloutVertexConfig = {
  extractVertices: (a: PdfFreeTextAnnoObject): Position[] => {
    const textBox = computeTextBoxFromRD(a.rect, a.rectangleDifferences);
    const cl = a.calloutLine;
    if (!cl || cl.length < 3) {
      return [
        { x: a.rect.origin.x, y: a.rect.origin.y },
        { x: a.rect.origin.x, y: a.rect.origin.y },
        { x: textBox.origin.x, y: textBox.origin.y },
        { x: textBox.origin.x + textBox.size.width, y: textBox.origin.y + textBox.size.height },
      ];
    }
    return [
      cl[0],
      cl[1],
      { x: textBox.origin.x, y: textBox.origin.y },
      { x: textBox.origin.x + textBox.size.width, y: textBox.origin.y + textBox.size.height },
    ];
  },
  transformAnnotation: (a: PdfFreeTextAnnoObject, vertices: Position[]) => {
    if (vertices.length < 4) return {};
    const [arrowTip, knee, tbTL, tbBR] = vertices;
    const textBox = {
      origin: { x: Math.min(tbTL.x, tbBR.x), y: Math.min(tbTL.y, tbBR.y) },
      size: {
        width: Math.abs(tbBR.x - tbTL.x),
        height: Math.abs(tbBR.y - tbTL.y),
      },
    };
    const connectionPoint = computeCalloutConnectionPoint(knee, textBox);
    const calloutLine = [arrowTip, knee, connectionPoint];
    const overallRect = computeCalloutOverallRect(
      textBox,
      calloutLine,
      a.lineEnding,
      a.strokeWidth ?? 1,
    );
    return {
      calloutLine,
      rect: overallRect,
      rectangleDifferences: computeRDFromTextBox(overallRect, textBox),
    };
  },
};
