import type {
  AnnotationBase,
  Color,
  HighlightAnnotation,
  PdfQuad,
  RichTextDocument,
  SquigglyAnnotation,
  StrikeoutAnnotation,
  UnderlineAnnotation,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import {
  readAnnotColor,
  readAnnotOpacity,
  readIntent,
  readQuadPoints,
} from './annotationReadPrimitives';
import { readCommentRichText } from '../richTextWire';
import { strikeoutIntentFromName } from '../textEditIntent';

const DEFAULT_HIGHLIGHT_COLOR: Color = '#ffff00';
const DEFAULT_TEXT_MARKUP_COLOR: Color = '#000000';

/**
 * Shared reader for the four text-markup subtypes. Wires color, opacity,
 * quadPoints and the comment's rich text; the caller fills in the `subtype` literal so the
 * result matches the requested DTO shape.
 */
export function readTextMarkupExtras(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  fallbackColor: Color = DEFAULT_TEXT_MARKUP_COLOR,
): {
  color: Color;
  opacity: number;
  quadPoints: PdfQuad[];
  richText: RichTextDocument | null;
} {
  const color = readAnnotColor(fn, mem, annotPtr) ?? fallbackColor;
  const ca = readAnnotOpacity(fn, mem, annotPtr);
  const opacity = ca == null ? 1 : Math.max(0, Math.min(1, ca));
  const quadPoints = readQuadPoints(fn, mem, annotPtr);
  return { color, opacity, quadPoints, richText: readCommentRichText(fn, mem, annotPtr) };
}

export function readHighlight(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): HighlightAnnotation<PdfCoordinates> {
  const extras = readTextMarkupExtras(fn, mem, annotPtr, DEFAULT_HIGHLIGHT_COLOR);
  return { ...base, subtype: 'highlight', ...extras };
}

export function readUnderline(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): UnderlineAnnotation<PdfCoordinates> {
  const extras = readTextMarkupExtras(fn, mem, annotPtr);
  return { ...base, subtype: 'underline', ...extras };
}

export function readSquiggly(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): SquigglyAnnotation<PdfCoordinates> {
  const extras = readTextMarkupExtras(fn, mem, annotPtr);
  return { ...base, subtype: 'squiggly', ...extras };
}

export function readStrikeout(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase<PdfCoordinates>,
): StrikeoutAnnotation<PdfCoordinates> {
  const extras = readTextMarkupExtras(fn, mem, annotPtr);
  const intent = strikeoutIntentFromName(readIntent(fn, mem, annotPtr));
  return { ...base, subtype: 'strikeout', intent, ...extras };
}
