import {
  EngineError,
  EngineErrorCode,
  type Color,
  type FontName,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

import { isStandardFont, standardFontToCode } from '../standardFont';
import type { AnnotationWriteContext } from './annotationWriteContext';
import {
  setDefaultAppearance,
  setDefaultAppearanceDocumentFont,
  setDefaultAppearanceRegisteredFont,
} from './annotationWritePrimitives';

/**
 * Write `/DA`. A standard font name goes through the native standard-font
 * path; one of the engine's fonts by its key is resolved to this thread's
 * FontId; one of the document's fonts by its name writes with that program.
 * A name that is none of these, or a document font that can't be chosen for
 * new text, fails with `InvalidArg`: the engine never quietly swaps in
 * another font.
 *
 * Shared by the free-text and redact writers: `/DA` styles a free-text body
 * and a redaction `/OverlayText` label through the exact same triple.
 */
export function applyDefaultAppearance(
  fn: PdfFunctions,
  annotPtr: Ptr,
  fontFamily: FontName,
  fontSize: number,
  color: Color,
  ctx: AnnotationWriteContext | undefined,
): void {
  if (isStandardFont(fontFamily)) {
    setDefaultAppearance(fn, annotPtr, standardFontToCode(fontFamily), fontSize, color);
    return;
  }
  if (ctx?.resolveRegisteredFontId && ctx.describeRegisteredFont?.(fontFamily)) {
    setDefaultAppearanceRegisteredFont(
      fn,
      annotPtr,
      ctx.resolveRegisteredFontId(fontFamily),
      fontSize,
      color,
    );
    return;
  }
  const document = ctx?.resolveDocumentFont?.(fontFamily);
  if (document) {
    if (!document.choosable) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `'${fontFamily}' can't be chosen for new text (${document.restrictions.join(', ')})`,
        { details: { field: 'fontFamily', restrictions: document.restrictions } },
      );
    }
    setDefaultAppearanceDocumentFont(fn, annotPtr, document.objectNumber, fontSize, color);
    return;
  }
  throw new EngineError(
    EngineErrorCode.InvalidArg,
    `fontFamily '${fontFamily}' is not a standard font, one of the engine's fonts or one of the document's`,
    { details: { field: 'fontFamily' } },
  );
}
