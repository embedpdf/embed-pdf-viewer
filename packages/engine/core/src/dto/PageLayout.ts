import type { PdfPageActions } from './PdfAction';
import type { PdfRect, PdfRotation, PdfSize } from '../geometry/primitives';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * The five PDF page boundary boxes as ISO 32000-1 §14.11.2 defines them: the
 * crop box defaults to the media box and the other three to the crop box, and
 * each is reduced to the part it shares with the media box. `crop` is the
 * visible page, what the page shows, so in page space it is
 * `{ x: 0, y: 0, width, height }` and the others are measured from its
 * top-left corner.
 *
 * The page's turn (`rotation`) never changes these numbers.
 */
export interface PageBoxes<C extends Coordinates = PageCoordinates> {
  media: C['box'];
  crop: C['box'];
  bleed: C['box'];
  trim: C['box'];
  art: C['box'];
}

/**
 * Static attributes for one page. This is the per-page element returned by
 * `pages.list()`.
 *
 * `size` is the un-rotated size of the visible page (`boxes.crop`), not
 * swapped for rotation.
 * `rotation` is a separate field; the SDK swaps width/height for 90/270 to
 * derive the on-screen display size. Keeping the wire un-rotated keeps it
 * consistent with the raw `boxes` and with the "transform lives in the SDK"
 * principle.
 */
export interface PageLayout<C extends Coordinates = PageCoordinates> {
  /** Display order at read time. Not an identity; shifts on a page move. */
  index: number;
  /**
   * The page's durable identity. The only safe key for cross-call
   * correlation and what every leaf URL (`/pages/{pageKey}/...`) is
   * addressed by; `index` is display order.
   */
  ref: PageRef;
  /** `/PageLabels` entry, or `null` when the PDF declares no label (the SDK
   * falls back to `index + 1`). */
  label: string | null;
  /** Un-rotated crop dimensions in PDF points. */
  size: PdfSize;
  rotation: PdfRotation;
  /** `/UserUnit`; defaults to the PDF default of 1. */
  userUnit: number;
  boxes: PageBoxes<C>;
  /**
   * Where the page sits in the file: its visible box (`boxes.crop`) in PDF
   * space, the numbers PDF tools use. The only PDF-space value in the API;
   * convert a page-space value with it (`pdfRectOf(rect, layout.pdfCropBox)`).
   */
  pdfCropBox: PdfRect;
  /** Page-owned `/AA` actions; absent for the usual script-less page. */
  actions?: PdfPageActions<C['destination']>;
}
