import type { PageRef } from '../identity/PageRef';

/**
 * An explicit PDF destination (ISO 32000-1 §12.3.2.2): a page, a location,
 * and a magnification. Produced by outlines/bookmarks, link annotations,
 * `/OpenAction`, and GoTo actions; named destinations resolve to one of
 * these through the catalog's `/Dests` dictionary or name tree — the
 * engine does that resolution, so the viewer only ever sees this explicit
 * form.
 *
 * Coordinates are PDF user space (y-up, points, absolute — not
 * crop-relative). `null` means "retain the current value" (the spec's
 * meaning for null array entries); a `/XYZ` zoom of `0` is equivalent to
 * null. The `fitB*` kinds refer to the page's content bounding box rather
 * than the crop box.
 *
 * Viewers translate these onto the stage's reveal primitive — see
 * `destinationToReveal` in `@embedpdf/plugin-stage`.
 */
export type PdfDestination =
  | {
      kind: 'xyz';
      page: PageRef;
      left?: number | null;
      top?: number | null;
      zoom?: number | null;
    }
  | { kind: 'fit'; page: PageRef }
  | { kind: 'fitH'; page: PageRef; top?: number | null }
  | { kind: 'fitV'; page: PageRef; left?: number | null }
  | {
      kind: 'fitR';
      page: PageRef;
      left: number;
      bottom: number;
      right: number;
      top: number;
    }
  | { kind: 'fitB'; page: PageRef }
  | { kind: 'fitBH'; page: PageRef; top?: number | null }
  | { kind: 'fitBV'; page: PageRef; left?: number | null };
