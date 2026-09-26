import {
  applyPoint,
  applyQuad,
  invert,
  pdfToContentMatrix,
  type Mat2D,
  type PointIn,
  type Quad,
  type QuadIn,
  type Rect,
  type RectIn,
} from './index';

/**
 * Page space — the public name of content space: the unrotated page's own
 * frame, origin at the CropBox top-left, y down, page units (PDF points × the
 * page's UserUnit is applied by the view, not here). Every plugin's public
 * geometry is in this space; PDF user space (y up, box origins preserved)
 * appears only on engine DTOs and on methods whose name ends in `Raw`.
 */
export type PagePoint = PointIn<'content'>;
export type PageRect = RectIn<'content'>;
export type PageQuad = QuadIn<'content'>;

/** A rectangle in PDF user space by its edges — the engine's `PdfRect` shape. */
export interface PdfEdges {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

/**
 * The one owner of page ↔ PDF conversion for one page. Built from the page's
 * CropBox; the y-flip and crop offset are encoded once, in
 * {@link pdfToContentMatrix}, and every method here composes from it.
 *
 *   pageX = pdfX − crop.left
 *   pageY = crop.top − pdfY
 */
export interface PageSpace {
  readonly crop: PdfEdges;
  readonly width: number;
  readonly height: number;
  pdfToPage(point: { x: number; y: number }): PagePoint;
  pageToPdf(point: { x: number; y: number }): PointIn<'pdf'>;
  pdfRectToPage(rect: PdfEdges): PageRect;
  pageRectToPdf(rect: Rect): PdfEdges;
  pdfQuadToPage(quad: Quad): PageQuad;
  pageQuadToPdf(quad: Quad): QuadIn<'pdf'>;
}

export function pageSpace(crop: PdfEdges): PageSpace {
  const toPage: Mat2D<'pdf', 'content'> = pdfToContentMatrix(crop);
  const toPdf: Mat2D<'content', 'pdf'> = invert(toPage);
  return {
    crop,
    width: crop.right - crop.left,
    height: crop.top - crop.bottom,
    pdfToPage: (point) => applyPoint(toPage, point as PointIn<'pdf'>),
    pageToPdf: (point) => applyPoint(toPdf, point as PointIn<'content'>),
    pdfRectToPage: (rect) =>
      ({
        x: rect.left - crop.left,
        y: crop.top - rect.top,
        width: rect.right - rect.left,
        height: rect.top - rect.bottom,
      }) as PageRect,
    pageRectToPdf: (rect) => ({
      left: rect.x + crop.left,
      right: rect.x + rect.width + crop.left,
      top: crop.top - rect.y,
      bottom: crop.top - (rect.y + rect.height),
    }),
    pdfQuadToPage: (quad) => applyQuad(toPage, quad as QuadIn<'pdf'>),
    pageQuadToPdf: (quad) => applyQuad(toPdf, quad as QuadIn<'content'>),
  };
}

/** Positive-area overlap of two PDF rects given by their edges — the engine's
 *  collateral rule (a redaction touches what it overlaps, not what it abuts). */
export function edgesOverlap(a: PdfEdges, b: PdfEdges): boolean {
  return (
    Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
    Math.min(a.top, b.top) > Math.max(a.bottom, b.bottom)
  );
}

/** The axis-aligned PDF edges enclosing a quad — the box a quad's text cell occupies. */
export function edgesOfQuad(quad: Quad): PdfEdges {
  const xs = [quad.p1.x, quad.p2.x, quad.p3.x, quad.p4.x];
  const ys = [quad.p1.y, quad.p2.y, quad.p3.y, quad.p4.y];
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}
