import type { AnnotationBorderStyle } from '@embedpdf/engine-core/runtime';

/**
 * `FPDF_ANNOT_BORDER_STYLE` enum codes from `public/fpdf_annot.h`. We keep
 * this PDFium-specific mapping in engine-services so engine-core stays free
 * of any PDFium dependency (mirrors `PDF_SUBTYPE_TO_CODE`).
 *
 *   UNKNOWN=0, SOLID=1, DASHED=2, BEVELED=3, INSET=4, UNDERLINE=5, CLOUDY=6
 *
 * The wire-stable `AnnotationBorderStyle` union covers the four styles a
 * shape annotation realistically authors; cloudy borders are surfaced
 * separately via `cloudyIntensity` (the `/BE` border effect).
 */
const BS_SOLID = 1;
const BS_DASHED = 2;
const BS_BEVELED = 3;
const BS_INSET = 4;

export function borderStyleToCode(style: AnnotationBorderStyle): number {
  switch (style) {
    case 'dashed':
      return BS_DASHED;
    case 'beveled':
      return BS_BEVELED;
    case 'inset':
      return BS_INSET;
    case 'solid':
    default:
      return BS_SOLID;
  }
}

export function borderStyleFromCode(code: number): AnnotationBorderStyle {
  switch (code) {
    case BS_DASHED:
      return 'dashed';
    case BS_BEVELED:
      return 'beveled';
    case BS_INSET:
      return 'inset';
    case BS_SOLID:
    default:
      return 'solid';
  }
}
