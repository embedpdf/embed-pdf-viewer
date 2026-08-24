/**
 * Closed-world string catalog of annotation subtypes the v3 wire format knows
 * about. The TypeScript discriminated union `AnnotationDTO` is keyed on this
 * literal type. PDFium's integer subtype code is mapped onto these strings
 * by the reader registry.
 *
 * `unsupported` is the forward-compat fallback for any PDF subtype that
 * the engine has not implemented a reader for yet. Unknown subtypes never
 * silently disappear from the wire — they round-trip as
 * `{ subtype: 'unsupported', rawSubtypeCode }`.
 */
export const ANNOTATION_SUBTYPES = [
  'text',
  'link',
  'free-text',
  'line',
  'square',
  'circle',
  'polygon',
  'polyline',
  'highlight',
  'underline',
  'squiggly',
  'strikeout',
  'stamp',
  'caret',
  'ink',
  'popup',
  'file-attachment',
  'redact',
  'widget',
  'unsupported',
] as const;

export type AnnotationSubtype = (typeof ANNOTATION_SUBTYPES)[number];

/**
 * PDFium subtype codes from `FPDFAnnot_GetSubtype`. Mirrors
 * `FPDF_ANNOTATION_SUBTYPE` in `public/fpdf_annot.h`. We keep this here
 * (rather than importing from @embedpdf/engine-runtime) so the engine-core
 * package has zero PDFium dependency.
 */
export const PdfAnnotationSubtypeCode = {
  UNKNOWN: 0,
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  RICHMEDIA: 26,
  XFAWIDGET: 27,
  REDACT: 28,
} as const;

export type PdfAnnotationSubtypeCode =
  (typeof PdfAnnotationSubtypeCode)[keyof typeof PdfAnnotationSubtypeCode];

/**
 * Map from PDFium codes to wire-stable string subtypes. Codes the engine
 * recognises as a v3 subtype (or maps to 'unsupported' if not yet wired).
 */
export const PDF_CODE_TO_SUBTYPE: Readonly<Record<number, AnnotationSubtype>> = Object.freeze({
  [PdfAnnotationSubtypeCode.TEXT]: 'text',
  [PdfAnnotationSubtypeCode.LINK]: 'link',
  [PdfAnnotationSubtypeCode.FREETEXT]: 'free-text',
  [PdfAnnotationSubtypeCode.LINE]: 'line',
  [PdfAnnotationSubtypeCode.SQUARE]: 'square',
  [PdfAnnotationSubtypeCode.CIRCLE]: 'circle',
  [PdfAnnotationSubtypeCode.POLYGON]: 'polygon',
  [PdfAnnotationSubtypeCode.POLYLINE]: 'polyline',
  [PdfAnnotationSubtypeCode.HIGHLIGHT]: 'highlight',
  [PdfAnnotationSubtypeCode.UNDERLINE]: 'underline',
  [PdfAnnotationSubtypeCode.SQUIGGLY]: 'squiggly',
  [PdfAnnotationSubtypeCode.STRIKEOUT]: 'strikeout',
  [PdfAnnotationSubtypeCode.STAMP]: 'stamp',
  [PdfAnnotationSubtypeCode.CARET]: 'caret',
  [PdfAnnotationSubtypeCode.INK]: 'ink',
  [PdfAnnotationSubtypeCode.POPUP]: 'popup',
  [PdfAnnotationSubtypeCode.FILEATTACHMENT]: 'file-attachment',
  [PdfAnnotationSubtypeCode.WIDGET]: 'widget',
  [PdfAnnotationSubtypeCode.REDACT]: 'redact',
});

/**
 * Reverse map for write paths that need to turn a wire subtype back into the
 * PDFium integer code without importing the zod-backed annotation registry.
 */
export const PDF_SUBTYPE_TO_CODE: Readonly<Record<AnnotationSubtype, PdfAnnotationSubtypeCode>> =
  Object.freeze({
    text: PdfAnnotationSubtypeCode.TEXT,
    link: PdfAnnotationSubtypeCode.LINK,
    'free-text': PdfAnnotationSubtypeCode.FREETEXT,
    line: PdfAnnotationSubtypeCode.LINE,
    square: PdfAnnotationSubtypeCode.SQUARE,
    circle: PdfAnnotationSubtypeCode.CIRCLE,
    polygon: PdfAnnotationSubtypeCode.POLYGON,
    polyline: PdfAnnotationSubtypeCode.POLYLINE,
    highlight: PdfAnnotationSubtypeCode.HIGHLIGHT,
    underline: PdfAnnotationSubtypeCode.UNDERLINE,
    squiggly: PdfAnnotationSubtypeCode.SQUIGGLY,
    strikeout: PdfAnnotationSubtypeCode.STRIKEOUT,
    stamp: PdfAnnotationSubtypeCode.STAMP,
    caret: PdfAnnotationSubtypeCode.CARET,
    ink: PdfAnnotationSubtypeCode.INK,
    popup: PdfAnnotationSubtypeCode.POPUP,
    'file-attachment': PdfAnnotationSubtypeCode.FILEATTACHMENT,
    redact: PdfAnnotationSubtypeCode.REDACT,
    widget: PdfAnnotationSubtypeCode.WIDGET,
    unsupported: PdfAnnotationSubtypeCode.UNKNOWN,
  });

export function subtypeFromCode(code: number): AnnotationSubtype {
  return PDF_CODE_TO_SUBTYPE[code] ?? 'unsupported';
}
