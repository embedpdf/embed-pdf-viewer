import type { PdfDestination } from '@embedpdf/engine-core/runtime';

/**
 * `PDFDEST_VIEW_*` fit-type codes (public/fpdf_doc.h) — the shared
 * vocabulary of `FPDFDest_GetView` (read) and `EPDFDest_CreateView`
 * (write). XYZ is listed for completeness but never goes through
 * CreateView (it has its own null-aware constructor).
 */
export const DEST_VIEW = {
  unknown: 0,
  xyz: 1,
  fit: 2,
  fitH: 3,
  fitV: 4,
  fitR: 5,
  fitB: 6,
  fitBH: 7,
  fitBV: 8,
} as const;

type NonXyzKind = Exclude<PdfDestination['kind'], 'xyz'>;

/** Wire destination kind → PDFDEST_VIEW code, for the non-XYZ kinds. */
export const VIEW_CODE_BY_KIND: Record<NonXyzKind, number> = {
  fit: DEST_VIEW.fit,
  fitH: DEST_VIEW.fitH,
  fitV: DEST_VIEW.fitV,
  fitR: DEST_VIEW.fitR,
  fitB: DEST_VIEW.fitB,
  fitBH: DEST_VIEW.fitBH,
  fitBV: DEST_VIEW.fitBV,
};
