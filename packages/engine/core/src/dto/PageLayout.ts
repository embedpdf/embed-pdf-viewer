import type { PdfRect, PdfRotation, PdfSize } from '../geometry/primitives';
import type { PageRef } from '../identity/PageRef';
import type { PdfPageActions } from './PdfAction';

/**
 * The five PDF page boundary boxes, in PDF user space as `PdfRect`s
 * (`{ left, bottom, right, top }`, y-up edges, page-box origin kept: a media
 * box may start at non-zero or negative numbers), as ISO 32000-1 §14.11.2
 * defines them: the crop box defaults to the media box and the other three to
 * the crop box, and each is reduced to the part it shares with the media box.
 * `crop` is the visible page, what the page shows.
 *
 * Coordinates are not rotated; the display transform (origin shift, y flip,
 * rotation) lives in the SDK, never here.
 */
export interface PageBoxes {
  media: PdfRect;
  crop: PdfRect;
  bleed: PdfRect;
  trim: PdfRect;
  art: PdfRect;
}

/**
 * Static attributes for one page. This is the per-page element returned by
 * `pages.list()`. It carries no annotation liveness (`revision`,
 * `weakAnnotationState`) — that lives on annotation reads and the cloud
 * manifest only.
 *
 * `size` is the un-rotated size of the visible page (`boxes.crop`), not
 * swapped for rotation.
 * `rotation` is a separate field; the SDK swaps width/height for 90/270 to
 * derive the on-screen display size. Keeping the wire un-rotated keeps it
 * consistent with the raw `boxes` and with the "transform lives in the SDK"
 * principle.
 */
export interface PageLayout {
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
  boxes: PageBoxes;
  /** Page-owned `/AA` actions; absent for the usual script-less page. */
  actions?: PdfPageActions;
}
