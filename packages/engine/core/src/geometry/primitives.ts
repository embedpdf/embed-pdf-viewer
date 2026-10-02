/**
 * Canonical PDF-document geometry primitives.
 *
 * These are the one geometry vocabulary the engine API speaks. They are
 * PDF user space:
 *   - y-up (origin at the page box's bottom-left; `top > bottom`)
 *   - edges, not x/y/width/height
 *   - page-box origin preserved (not origin-normalized)
 *   - browser-free (no DOM, no device pixels) and portable to Rust/Swift/Kotlin
 *
 * They are the only geometry ever sent as engine wire data. Viewer-local
 * geometry (content/view/screen space, y-down, x/y/width/height) lives in the
 * viewer layer and is always produced from these by an explicit transform.
 *
 * No dependency on PDFium or any browser/Node surface: this is the lingua
 * franca between local engine, cloud engine, and server.
 */

/** A point in PDF user space (y-up). */
export interface PdfPoint {
  x: number;
  y: number;
}

/**
 * A rectangle in the file's coordinates — PDF user space, expressed as edges
 * (y-up, so `top > bottom` and `right > left` once normalized). Page-box
 * origin is preserved, so `left`/`bottom` may be non-zero or negative.
 *
 * The rule: stored in the file → `PdfRect`; shown on screen → the viewer's
 * y-down `Rect` (`{x, y, width, height}`). The shapes are incompatible on
 * purpose — passing one where the other goes doesn't compile.
 */
export interface PdfRect {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

/** A width/height pair in PDF points. */
export interface PdfSize {
  width: number;
  height: number;
}

/**
 * The two endpoints of a line annotation's `/L` entry, in PDF user space
 * (y-up). `start` is `[x1 y1]` and `end` is `[x2 y2]`.
 */
export interface LinePoints {
  start: PdfPoint;
  end: PdfPoint;
}

/**
 * A single ink stroke — one continuous pen path, as the ordered point list
 * of an `/InkList` sub-array. Coordinates are PDF user space, y-up.
 */
export type InkStroke = PdfPoint[];

/**
 * An ink annotation's `/InkList` — an array of strokes (each a point path).
 * Mirrors the PDF structure: `/InkList [ [x1 y1 x2 y2 ...] [ ... ] ]`.
 */
export type InkList = InkStroke[];

/**
 * A free-text callout annotation's `/CL` leader line, in PDF user space
 * (y-up). Two points draw a straight leader (`[knee->end]` collapses to
 * `[start, end]`); three points draw a knee-jointed leader
 * (`[start, knee, end]`). The last point is the end that touches the text
 * box; the first is the point being called out.
 */
export type CalloutLine = readonly [PdfPoint, PdfPoint] | readonly [PdfPoint, PdfPoint, PdfPoint];

/**
 * A quad: four corners named in the text's own upright frame. `upper` is the
 * ascent side and `lower` the baseline side; `left` to `right` runs along the
 * frame's x axis. The names are neither screen directions nor reading order:
 * text turned 180° has its `upperLeft` at the bottom right of the page, and
 * right-to-left text still runs from `left` to `right`. Coordinates are PDF
 * user space, y-up.
 *
 * The engine keeps the names true: its text geometry makes them, and every
 * `/QuadPoints` entry it reads is named by `normalizePdfQuad`. It writes the
 * corners in the order Acrobat reads: upper-left, upper-right, lower-left,
 * lower-right.
 */
export interface PdfQuad {
  upperLeft: PdfPoint;
  upperRight: PdfPoint;
  lowerLeft: PdfPoint;
  lowerRight: PdfPoint;
}

/**
 * A page's rotation in degrees clockwise — the `/Rotate` values PDF permits.
 * Presentation metadata only; normalized content coordinates stay y-up.
 */
export type PdfRotation = 0 | 90 | 180 | 270;
