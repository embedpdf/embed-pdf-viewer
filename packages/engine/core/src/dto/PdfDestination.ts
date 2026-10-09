import type { PageRef } from '../identity/PageRef';

/**
 * A destination as the file writes it (ISO 32000-1 §12.3.2.2): a page, a
 * location in the file's coordinates (y up, absolute, the page box's origin
 * kept) and a magnification. The engine hands out {@link PageDestination}s;
 * this shape is for values that come from the file or from another PDF
 * tool, turned into page space with `pageDestinationOf`.
 *
 * `null` keeps the viewer's current value, as in the file; a `/XYZ` zoom of
 * `0` means the same as `null`. The `fitB*` kinds fit the page's content
 * bounding box rather than the whole page.
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

/**
 * A destination (ISO 32000-1 §12.3.2.2): the page it goes to and where on
 * that page, measured from the top-left of that page's visible box, y down.
 * Outlines, links, actions and the document's open destination all resolve
 * to one of these; named destinations are resolved by the engine, so only
 * this explicit form is ever handed out.
 *
 * `null` keeps the viewer's current value, as in the file, and a value left
 * out means the same; an `xyz` zoom of `0` means the same as `null`. The
 * `fitB*` kinds fit the page's content bounding box rather than the whole
 * page. Pass one straight to the stage's `reveal`.
 */
export type PageDestination =
  | { kind: 'xyz'; page: PageRef; x?: number | null; y?: number | null; zoom?: number | null }
  | { kind: 'fit'; page: PageRef }
  | { kind: 'fitH'; page: PageRef; y?: number | null }
  | { kind: 'fitV'; page: PageRef; x?: number | null }
  | { kind: 'fitR'; page: PageRef; x: number; y: number; width: number; height: number }
  | { kind: 'fitB'; page: PageRef }
  | { kind: 'fitBH'; page: PageRef; y?: number | null }
  | { kind: 'fitBV'; page: PageRef; x?: number | null };
