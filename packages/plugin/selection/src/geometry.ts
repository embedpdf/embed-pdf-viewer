/**
 * The selection plugin's coordinate seam — and nothing else.
 *
 * Segmentation, hit-testing, and word/line expansion live in the canonical
 * engine-core text layout (`@embedpdf/engine-core` `text/layout`): a text
 * range has exactly one segmentation whether it came from a drag or a
 * search. This module only converts between the viewer's content space
 * (y-down, crop-relative) and the engine's PDF space (y-up) — pointer
 * points inward, canonical segments outward. The PDF↔content y-flip is the
 * geometry package's `pageGeometry` (the one place that math lives), never
 * hand-rolled here.
 */
import {
  applyPoint,
  invert,
  pageGeometry,
  textQuadBounds,
  type Mat2D,
  type Point,
  type PointIn,
  type Rect,
  type TextQuad,
} from '@embedpdf/core-geometry';
import {
  buildPageTextLayout,
  type PageGeometrySnapshot,
  type PageTextLayout,
  type PdfPoint,
  type PdfQuad,
  type PdfRect,
  type PdfTextSegment,
} from '@embedpdf/engine-core/runtime';

/**
 * One merged visual line of a selection, in content space — the structural
 * twin of the engine's `PdfTextSegment`. `quad` carries frame-geometric
 * corner semantics (upper = ascent side, start = the frame's −x); `advance`
 * is the reading direction along the baseline (+1 = toward `end`), derived
 * from the glyph sequence — geometry and bidi stay separate concerns.
 * `rect` is the content-space AABB.
 */
export interface SelectionSegment {
  quad: TextQuad;
  rect: Rect;
  advance: 1 | -1;
}

/** A page's cached selection geometry: the canonical layout + the seam. */
export interface SelectionPageGeometry {
  layout: PageTextLayout;
  toContent: Mat2D<'pdf', 'content'>;
  fromContent: Mat2D<'content', 'pdf'>;
}

/**
 * Build a page's selection geometry. Page display rotation does not enter
 * here — the overlay rides the page's CSS rotation, so content space stays
 * un-rotated (the crop-relative y-flip is the only conversion; zoom = 1,
 * the viewer's zoom is applied later by `PageTransform.toPixels`).
 */
export function buildSelectionPageGeometry(
  snapshot: PageGeometrySnapshot,
  crop: PdfRect,
  rotation: 0 | 90 | 180 | 270,
  userUnit: number,
): SelectionPageGeometry {
  const { pdfToContent } = pageGeometry({ crop, rotation, userUnit }, 1);
  return {
    layout: buildPageTextLayout(snapshot),
    toContent: pdfToContent,
    fromContent: invert(pdfToContent),
  };
}

/** A content-space pointer point in the layout's PDF space. */
export function contentPointToPdf(pageGeometry: SelectionPageGeometry, point: Point): PdfPoint {
  return applyPoint(pageGeometry.fromContent, point as PointIn<'content'>);
}

/**
 * A canonical PDF quad in content space. Engine quads carry frame-geometric
 * slot semantics (`p1..p4` = upper-start, upper-end, lower-start,
 * lower-end) — a trusted producer, so the y-flip maps corners straight onto
 * their names; imported-annotation normalization does not apply here.
 */
export function toContentTextQuad(pageGeometry: SelectionPageGeometry, quad: PdfQuad): TextQuad {
  const toContent = (point: PdfPoint): Point =>
    applyPoint(pageGeometry.toContent, point as PointIn<'pdf'>);
  return {
    upperStart: toContent(quad.p1),
    upperEnd: toContent(quad.p2),
    lowerStart: toContent(quad.p3),
    lowerEnd: toContent(quad.p4),
  };
}

/** A canonical segment in content space (`rect` recomputed from the mapped
 *  quad so the pair can never drift). */
export function toContentSegment(
  pageGeometry: SelectionPageGeometry,
  segment: PdfTextSegment,
): SelectionSegment {
  const quad = toContentTextQuad(pageGeometry, segment.quad);
  return { quad, rect: textQuadBounds(quad), advance: segment.advance };
}
