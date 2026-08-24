import type { AnnotationBase, Color, RedactAnnotationDTO } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { FPDFANNOT_COLORTYPE } from '../colorType';
import { DEFAULT_STANDARD_FONT, standardFontFromCode } from '../standardFont';
import { textAlignmentFromCode } from '../textAlignment';
import {
  readAnnotColor,
  readAnnotOpacity,
  readDefaultAppearance,
  readOverlayText,
  readOverlayTextRepeat,
  readQuadPoints,
  readTextAlignment,
} from './annotationReadPrimitives';

/** Default `/C` marking outline (red) — the redaction marking convention and
 *  the AP generator's default. */
const DEFAULT_REDACT_COLOR: Color = { r: 255, g: 0, b: 0 };

/** Default label colour (black) when a redaction carries no `/DA`. */
const DEFAULT_LABEL_COLOR: Color = { r: 0, g: 0, b: 0 };

/** Default label size when there is no `/DA`. When a `/DA` IS present its
 *  size is kept verbatim — including `0`, which means auto-fit for a
 *  redaction label (unlike free text, which normalizes 0 away). */
const DEFAULT_FONT_SIZE = 12;

export function readRedact(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
): RedactAnnotationDTO {
  const color = readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.Color) ?? {
    ...DEFAULT_REDACT_COLOR,
  };
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  const interiorColor =
    readAnnotColor(fn, mem, annotPtr, FPDFANNOT_COLORTYPE.InteriorColor) ?? null;

  const da = readDefaultAppearance(fn, mem, annotPtr);
  const fontFamily = da ? standardFontFromCode(da.fontCode) : DEFAULT_STANDARD_FONT;
  const fontSize = da ? da.fontSize : DEFAULT_FONT_SIZE;
  const fontColor = da?.color ?? { ...DEFAULT_LABEL_COLOR };

  return {
    ...base,
    subtype: 'redact',
    quadPoints: readQuadPoints(fn, mem, annotPtr),
    color,
    opacity,
    interiorColor,
    overlayText: readOverlayText(fn, mem, annotPtr),
    repeat: readOverlayTextRepeat(fn, annotPtr),
    fontFamily,
    fontSize,
    fontColor,
    textAlign: textAlignmentFromCode(readTextAlignment(fn, annotPtr)),
  };
}
