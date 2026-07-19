/**
 * Canonical PDF-document geometry primitives.
 *
 * These are the ONE geometry vocabulary the engine API speaks. They are
 * PDF user space:
 *   - y-UP (origin at the page box's bottom-left; `top > bottom`)
 *   - edges, not x/y/width/height
 *   - page-box origin preserved (NOT origin-normalized)
 *   - browser-free (no DOM, no device pixels) and portable to Rust/Swift/Kotlin
 *
 * They are the only geometry ever sent as engine wire data. Viewer-local
 * geometry (content/view/screen space, y-down, x/y/width/height) lives in the
 * v3 viewer layer and is always produced from these by an EXPLICIT transform.
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
 * A rectangle in PDF user space, expressed as edges (y-up, so `top > bottom`
 * and `right > left` once normalized). Page-box origin is preserved, so
 * `left`/`bottom` may be non-zero or negative.
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
 * A /QuadPoints quad. The four points are POSITIONAL, in PDFium
 * `FS_QUADPOINTSF` order (PDF 32000 §12.5.6.10): `p1 p2 p3 p4`. Coordinates
 * are PDF user space, y-up.
 *
 * This type asserts NO corner semantics. Quads can be rotated or skewed
 * (e.g. text markup over rotated text), and PDF producers disagree on corner
 * order — so naming corners `topLeft`/... on the wire would be a false
 * guarantee. Derive named corners with `pdfQuadCorners` (valid only for
 * axis-aligned quads) or get the enclosing box with `pdfQuadBounds`.
 */
export interface PdfQuad {
  p1: PdfPoint;
  p2: PdfPoint;
  p3: PdfPoint;
  p4: PdfPoint;
}

/**
 * A page's rotation in degrees clockwise — the `/Rotate` values PDF permits.
 * Presentation metadata only; normalized content coordinates stay y-up.
 */
export type PdfRotation = 0 | 90 | 180 | 270;
