import {
  EngineError,
  EngineErrorCode,
  type Color,
  type FreeTextFont,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/pdf-runtime';

import { isStandardFont, standardFontToCode } from '../standardFont';
import type { AnnotationWriteContext } from './annotationWriteContext';
import {
  setDefaultAppearance,
  setDefaultAppearanceRegisteredFont,
} from './annotationWritePrimitives';

/**
 * Write `/DA`. A standard font name goes through the native standard-font
 * path; anything else is treated as a registered-font `key` and resolved to
 * this thread's FontId. A key with no resolver wired (e.g. a host without a
 * font registry) is a programming error — fail loud rather than silently
 * downgrade to Helvetica and embed the wrong glyphs.
 *
 * Shared by the free-text and redact writers: `/DA` styles a free-text body
 * and a redaction `/OverlayText` label through the exact same triple.
 */
export function applyDefaultAppearance(
  fn: PdfFunctions,
  annotPtr: Ptr,
  fontFamily: FreeTextFont,
  fontSize: number,
  color: Color,
  ctx: AnnotationWriteContext | undefined,
): void {
  if (isStandardFont(fontFamily)) {
    setDefaultAppearance(fn, annotPtr, standardFontToCode(fontFamily), fontSize, color);
    return;
  }
  if (!ctx?.resolveRegisteredFontId) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `fontFamily '${fontFamily}' is not a standard font and no font registry is available on this host`,
    );
  }
  setDefaultAppearanceRegisteredFont(
    fn,
    annotPtr,
    ctx.resolveRegisteredFontId(fontFamily),
    fontSize,
    color,
  );
}
