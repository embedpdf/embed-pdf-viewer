import { PdfAnnotationObject, Rotation, Size } from '@embedpdf/models';
import { clamp } from '@embedpdf/core';
import { basePropertyRotationChanges } from './base-patch';

/**
 * Applies a counter-rotation to make an annotation appear visually upright
 * on a rotated page. Uses `basePropertyRotationChanges` to correctly compute
 * rect, unrotatedRect, and rotation for the annotation.
 *
 * @param annotation - The annotation to transform
 * @param pageRotation - Effective page rotation as quarter-turn value (0-3)
 * @param rectWasDrawn - `true` if the rect was produced by a marquee drag
 *   (PagePointerProvider transposes dimensions on 90/270 pages),
 *   `false` if the rect was placed from config/content (click-to-place, stamp)
 * @returns The annotation with rotation, unrotatedRect, and rect set
 */
export function applyInsertUpright<T extends PdfAnnotationObject>(
  annotation: T,
  pageRotation: Rotation,
  rectWasDrawn: boolean,
): T {
  if (pageRotation === 0 || annotation.rotation !== undefined) return annotation;

  const counterDeg = ((4 - pageRotation) % 4) * 90;
  let baseAnnotation = annotation;

  // For marquee-drawn rects on 90/270, PagePointerProvider transposes dimensions.
  // Swap width/height back before computing the rotated bounding box.
  if (rectWasDrawn && (pageRotation === 1 || pageRotation === 3)) {
    const originalRect = annotation.rect;
    const centerX = originalRect.origin.x + originalRect.size.width / 2;
    const centerY = originalRect.origin.y + originalRect.size.height / 2;
    baseAnnotation = {
      ...annotation,
      rect: {
        origin: {
          x: centerX - originalRect.size.height / 2,
          y: centerY - originalRect.size.width / 2,
        },
        size: {
          width: originalRect.size.height,
          height: originalRect.size.width,
        },
      },
    };
  }

  const { rotation, rect, unrotatedRect } = basePropertyRotationChanges(baseAnnotation, counterDeg);

  return { ...baseAnnotation, rotation, rect, unrotatedRect } as T;
}

/**
 * Clamps an annotation's rect to stay within page bounds.
 * If the annotation has an unrotatedRect, it is shifted by the same delta
 * to keep the geometry consistent.
 */
export function clampAnnotationToPage<T extends PdfAnnotationObject>(
  annotation: T,
  pageSize: Size,
): T {
  const clampedX = clamp(annotation.rect.origin.x, 0, pageSize.width - annotation.rect.size.width);
  const clampedY = clamp(
    annotation.rect.origin.y,
    0,
    pageSize.height - annotation.rect.size.height,
  );
  const shiftX = clampedX - annotation.rect.origin.x;
  const shiftY = clampedY - annotation.rect.origin.y;
  if (shiftX === 0 && shiftY === 0) return annotation;
  return {
    ...annotation,
    rect: { origin: { x: clampedX, y: clampedY }, size: annotation.rect.size },
    ...(annotation.unrotatedRect
      ? {
          unrotatedRect: {
            origin: {
              x: annotation.unrotatedRect.origin.x + shiftX,
              y: annotation.unrotatedRect.origin.y + shiftY,
            },
            size: annotation.unrotatedRect.size,
          },
        }
      : {}),
  };
}
