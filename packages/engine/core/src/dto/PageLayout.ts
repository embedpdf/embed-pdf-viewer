import type { PdfRect, PdfRotation, PdfSize } from '../geometry/primitives';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { PdfPageActions } from './PdfAction';

/**
 * @deprecated The page boxes are now `PdfRect` objects (`{ left, bottom,
 * right, top }`, y-up edges) from `../geometry`. This alias remains only
 * during the geometry consolidation.
 */
export type { PdfRect } from '../geometry/primitives';

/**
 * @deprecated Use `PdfRotation` from `../geometry`. A page's display rotation
 * in degrees clockwise — the `/Rotate` values PDF permits. Presentation
 * metadata only; content coordinates stay normalized.
 */
export type PageRotation = PdfRotation;

/**
 * The five PDF page boundary boxes, each in PDF user space as a `PdfRect`
 * (`{ left, bottom, right, top }`, y-up edges, page-box origin preserved —
 * a MediaBox may have a non-zero or negative origin). `media` and `crop` are
 * always present (`crop` defaults to `media` when the PDF omits it — the
 * viewer always needs an effective crop). `bleed`, `trim`, and `art` are
 * present only when the PDF actually declares them.
 *
 * Coordinates are NOT rotated and NOT origin-normalized; the display
 * transform (origin shift, Y-flip, rotation) lives in the SDK, never here.
 */
export interface PageBoxes {
  media: PdfRect;
  crop: PdfRect;
  bleed?: PdfRect;
  trim?: PdfRect;
  art?: PdfRect;
}

/**
 * Static attributes for one page. This is the per-page element returned by
 * `pages.list()`. It carries NO annotation liveness (`revision`,
 * `weakAnnotationState`) — that lives on annotation reads and the cloud
 * manifest only.
 *
 * `size` is the UN-rotated crop dimensions (from
 * `EPDF_GetPageSizeByIndexNormalized`, which does not swap for rotation).
 * `rotation` is a separate field; the SDK swaps width/height for 90/270 to
 * derive the on-screen display size. Keeping the wire un-rotated keeps it
 * consistent with the raw `boxes` and with the "transform lives in the SDK"
 * principle.
 */
export interface PageLayout {
  /** Display order at read time. Not an identity; shifts on a page move. */
  index: number;
  /** Durable identity; the only safe key for cross-call correlation and the
   * key every leaf URL (`/pages/{pon}/...`) is addressed by. */
  pageObjectNumber: PageObjectNumber;
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
