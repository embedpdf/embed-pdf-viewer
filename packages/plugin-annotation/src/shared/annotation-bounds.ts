import { Rotation } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface ScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function mapCounterRotatePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: Rotation,
): { x: number; y: number } {
  switch (rotation) {
    case 1:
      return { x: y, y: height - x };
    case 2:
      return { x: width - x, y: height - y };
    case 3:
      return { x: width - y, y: x };
    default:
      return { x, y };
  }
}

/**
 * Compute the screen-space bounding box of an annotation, correctly accounting
 * for `noZoom` (constant pixel size regardless of zoom) and `noRotate`
 * (visually upright regardless of page rotation) annotation flags.
 */
export function getAnnotationScreenBounds(
  annotation: TrackedAnnotation,
  scale: number,
  rotation: Rotation,
): ScreenBounds {
  const flags = annotation.object.flags ?? [];
  const hasNoZoom = flags.includes('noZoom');
  const hasNoRotate = flags.includes('noRotate');

  const left = annotation.object.rect.origin.x * scale;
  const top = annotation.object.rect.origin.y * scale;
  const width = annotation.object.rect.size.width * (hasNoZoom ? 1 : scale);
  const height = annotation.object.rect.size.height * (hasNoZoom ? 1 : scale);

  if (!hasNoRotate || rotation === 0) {
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  }

  const corners = [
    mapCounterRotatePoint(0, 0, width, height, rotation),
    mapCounterRotatePoint(width, 0, width, height, rotation),
    mapCounterRotatePoint(0, height, width, height, rotation),
    mapCounterRotatePoint(width, height, width, height, rotation),
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    if (corner.x < minX) minX = corner.x;
    if (corner.y < minY) minY = corner.y;
    if (corner.x > maxX) maxX = corner.x;
    if (corner.y > maxY) maxY = corner.y;
  }

  return {
    left: left + minX,
    top: top + minY,
    right: left + maxX,
    bottom: top + maxY,
  };
}
