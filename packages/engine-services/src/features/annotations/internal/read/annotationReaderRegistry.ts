import type {
  AnnotationBase,
  AnnotationDTO,
  AnnotationSubtype,
} from '@embedpdf/engine-core/runtime';
import { subtypeFromCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/pdf-runtime';

import type { AnnotationReadContext } from './annotationReadContext';
import { readCaret } from './readCaretAnnotation';
import { readFileAttachment } from './readFileAttachmentAnnotation';
import { readFreeText } from './readFreeTextAnnotation';
import { readInk } from './readInkAnnotation';
import { readLine } from './readLineAnnotation';
import { readLink } from './readLinkAnnotation';
import { readRedact } from './readRedactAnnotation';
import { readCircle, readSquare } from './readShapeAnnotation';
import { readStamp } from './readStampAnnotation';
import { readText } from './readTextAnnotation';
import {
  readHighlight,
  readSquiggly,
  readStrikeout,
  readUnderline,
} from './readTextMarkupAnnotation';
import { readUnsupported } from './readUnsupportedAnnotation';
import { readPolygon, readPolyline } from './readVertexAnnotation';
import { readWidget } from './readWidgetAnnotation';

/**
 * One reader per `AnnotationSubtype`. Each reader produces the DTO type
 * the registry promised: `kinds/<subtype>/dto.ts`. Readers receive the
 * pre-built `AnnotationBase` (identity + flags + rect + dates) so each
 * implementation only has to materialise its own fields, plus the
 * document-scoped `AnnotationReadContext` — most readers ignore it (they
 * work off the `annotPtr` alone); the link reader consumes it.
 *
 * The `unsupported` fallback preserves the raw subtype code so a future
 * reader landing for that subtype can replace it without a wire-format
 * version bump.
 */
export type AnnotationSubtypeReader = (
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  base: AnnotationBase,
  rawSubtypeCode: number,
  ctx: AnnotationReadContext,
) => AnnotationDTO;

const READER_BY_SUBTYPE: Partial<Record<AnnotationSubtype, AnnotationSubtypeReader>> = {
  highlight: readHighlight,
  underline: readUnderline,
  squiggly: readSquiggly,
  strikeout: readStrikeout,
  circle: readCircle,
  square: readSquare,
  polygon: readPolygon,
  polyline: readPolyline,
  line: readLine,
  link: readLink,
  ink: readInk,
  'free-text': readFreeText,
  caret: readCaret,
  text: readText,
  stamp: readStamp,
  'file-attachment': readFileAttachment,
  widget: readWidget,
  redact: readRedact,
  unsupported: readUnsupported,
};

/**
 * Maps a PDFium subtype code onto the reader that should handle it.
 * Returns the `unsupported` reader for any subtype that doesn't have a
 * dedicated reader yet.
 */
export function pickReader(rawSubtypeCode: number): {
  reader: AnnotationSubtypeReader;
  subtype: AnnotationSubtype;
} {
  const subtype = subtypeFromCode(rawSubtypeCode);
  const reader = READER_BY_SUBTYPE[subtype];
  if (reader) return { reader, subtype };
  return { reader: READER_BY_SUBTYPE.unsupported!, subtype: 'unsupported' };
}
