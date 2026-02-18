import { Rect, Size, Rotation } from '@embedpdf/models';
import { LayoutDetection, clamp } from '@embedpdf/ai';
import { LayoutBlock } from './types';

const MODEL_INPUT_SIZE = 800;

/**
 * Map layout detections from model output space to page coordinates.
 *
 * The model outputs coordinates in its 800x800 input space (or sometimes
 * in source image space). This function:
 * 1. Normalizes coordinates to source image space
 * 2. Scales from source image pixels to page points
 *
 * Page coordinates use top-left origin (same as browser/CSS),
 * matching the project's Rect convention.
 */
export function mapDetectionsToPageCoordinates(
  detections: LayoutDetection[],
  imageSize: Size,
  pageSize: Size,
  pageRotation: Rotation = 0,
): LayoutBlock[] {
  // Determine if coordinates are in model space (800x800) or source space
  const normalized = normalizeToSourceSpace(detections, imageSize);

  const scaleX = pageSize.width / imageSize.width;
  const scaleY = pageSize.height / imageSize.height;

  return normalized.map((det) => {
    const [x1, y1, x2, y2] = det.bbox;

    // Scale from image pixels to page points (both use top-left origin)
    const pdfX = x1 * scaleX;
    const pdfY = y1 * scaleY;
    const pdfW = (x2 - x1) * scaleX;
    const pdfH = (y2 - y1) * scaleY;

    const rect: Rect = {
      origin: { x: pdfX, y: pdfY },
      size: { width: pdfW, height: pdfH },
    };

    return {
      id: det.id,
      classId: det.classId,
      label: det.label,
      score: det.score,
      rect,
      imageBbox: det.bbox,
      readingOrder: det.readingOrder,
    };
  });
}

/**
 * Normalize detection coordinates from model space (800x800) to source image space.
 * Follows the same heuristic as the test project.
 */
function normalizeToSourceSpace(detections: LayoutDetection[], imageSize: Size): LayoutDetection[] {
  if (detections.length === 0) return [];

  let maxCoord = 0;
  for (const det of detections) {
    for (const [x, y] of det.polygon) {
      maxCoord = Math.max(maxCoord, x, y);
    }
  }

  const modelCoordTolerance = MODEL_INPUT_SIZE * 0.08;
  const looksLikeModelSpace = maxCoord <= MODEL_INPUT_SIZE + modelCoordTolerance;
  const sourceIsDifferentSize =
    Math.abs(imageSize.width - MODEL_INPUT_SIZE) > 2 ||
    Math.abs(imageSize.height - MODEL_INPUT_SIZE) > 2;
  const shouldScale = looksLikeModelSpace && sourceIsDifferentSize;

  if (!shouldScale) return detections;

  const scaleX = imageSize.width / MODEL_INPUT_SIZE;
  const scaleY = imageSize.height / MODEL_INPUT_SIZE;

  return detections.map((det) => {
    const polygon = det.polygon.map(([x, y]) => [
      clamp(x * scaleX, 0, imageSize.width),
      clamp(y * scaleY, 0, imageSize.height),
    ]) as LayoutDetection['polygon'];

    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const bbox: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];

    return { ...det, polygon, bbox };
  });
}

/**
 * Map table structure element coordinates from the padded crop space
 * to page coordinates.
 *
 * The table crop is rendered via `renderPageRectRaw(tableRect)` producing
 * `cropImageSize` pixels, then `padImageData` adds `padding` white pixels
 * on each side. The model receives the padded image and outputs bboxes
 * in that padded image's coordinate space.
 *
 * Mapping: padded image coords → remove padding → crop pixel coords →
 * scale to page rect dimensions → offset by rect origin.
 */
export function mapTableElementToPageCoordinates(
  elementBbox: [number, number, number, number],
  tableRect: Rect,
  cropImageSize: Size,
  padding: number,
): Rect {
  const [ex1, ey1, ex2, ey2] = elementBbox;

  // Remove padding offset to get crop-relative pixel coords
  const cx1 = ex1 - padding;
  const cy1 = ey1 - padding;
  const cx2 = ex2 - padding;
  const cy2 = ey2 - padding;

  // Scale from crop pixels to page rect dimensions
  const scaleX = tableRect.size.width / cropImageSize.width;
  const scaleY = tableRect.size.height / cropImageSize.height;

  // Map to page space (both use top-left origin)
  const pdfX = tableRect.origin.x + cx1 * scaleX;
  const pdfY = tableRect.origin.y + cy1 * scaleY;
  const pdfW = (cx2 - cx1) * scaleX;
  const pdfH = (cy2 - cy1) * scaleY;

  return {
    origin: { x: pdfX, y: pdfY },
    size: { width: pdfW, height: pdfH },
  };
}
