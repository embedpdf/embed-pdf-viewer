import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import { isFinitePdfRect, normalizePdfRect } from '../../geometry/convert';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { semanticEqual } from '../appearance';
import type { Annotation, AnnotationPatch } from '../kinds';
import { DRAWN_RECT_KINDS, pdfShapeForRect, shapeFieldsOf } from '../shapeForRect';

/**
 * An update's `rect` on a drawn kind, resolved as a command: the rect it
 * read, sent back, is dropped (nothing moves); another rect becomes the shape
 * fields that put the drawing there. It can't come with a change to the shape
 * itself: which of the two to follow would be a guess, so it is refused
 * (`InvalidArg` on `rect`), as is a rect that isn't four finite numbers. A
 * kind whose shape is its rect keeps it as a plain field. The page-space
 * `resolveRectCommand` runs it on page-space values.
 */
export function pdfResolveRectCommand(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  const { rect, ...rest } = patch as AnnotationPatch<PdfCoordinates> & { rect?: unknown };
  if (rect === undefined || !DRAWN_RECT_KINDS.has(current.subtype)) return patch;
  if (!isFinitePdfRect(rect)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${current.subtype} update field 'rect': not a rect of finite numbers`,
      { details: { field: 'rect' } },
    );
  }
  // The rect it read, sent back: nothing moves.
  if (semanticEqual(normalizePdfRect(rect), current.rect)) {
    return rest as AnnotationPatch<PdfCoordinates>;
  }
  const read = current as unknown as Record<string, unknown>;
  const changed = shapeFieldsOf(current.subtype).find((name) => {
    const value = (patch as unknown as Record<string, unknown>)[name];
    return value !== undefined && !semanticEqual(value, read[name]);
  });
  if (changed) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${current.subtype} update field 'rect': a new rect moves the shape, so it can't come with a new '${changed}'`,
      { details: { field: 'rect' } },
    );
  }
  const { left, bottom, right, top } = rect;
  return {
    ...rest,
    ...pdfShapeForRect(current, { left, bottom, right, top }),
  } as AnnotationPatch<PdfCoordinates>;
}
