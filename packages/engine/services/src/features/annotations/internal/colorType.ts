/**
 * `FPDFANNOT_COLORTYPE` enum codes from `public/fpdf_annot.h`. Shared by
 * the annotation read/write primitives and the shape reader/writer so the
 * color-selector magic numbers live in exactly one place.
 *
 *   Color=0 (the stroke/fill `/C`)
 *   InteriorColor=1 (the `/IC` of square/circle/polygon)
 *   OverlayColor=2 (the redaction overlay)
 *   TextColor=3 (the free-text `/DA` color)
 */
export const FPDFANNOT_COLORTYPE = {
  Color: 0,
  InteriorColor: 1,
  OverlayColor: 2,
  TextColor: 3,
} as const;

export type AnnotationColorType = (typeof FPDFANNOT_COLORTYPE)[keyof typeof FPDFANNOT_COLORTYPE];
