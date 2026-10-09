import type { PageCoordinates, PdfCoordinates } from './coordinates';
import type { PageRenderTarget } from '../dto/PageRender';
import { pageBoxOf, pdfRectOf, type PageBox } from '../geometry/pageSpace';
import type { PdfRect } from '../geometry/primitives';

/** A page-space render target in the file's coordinates. `visible` is the page's visible box. */
export function pdfRenderTargetOf(
  target: PageRenderTarget<PageCoordinates>,
  visible: PdfRect,
): PageRenderTarget<PdfCoordinates> {
  return target.kind === 'rect' ? { ...target, rect: pdfRectOf(target.rect, visible) } : target;
}

/**
 * Where each rendered appearance goes, in page space: raster or encoded, each
 * placed by its `rect`. `visible` is the page's visible box.
 */
export function pageAppearancesOf<Appearance extends { rect: PdfRect }>(
  appearances: readonly Appearance[],
  visible: PdfRect,
): Array<Omit<Appearance, 'rect'> & { rect: PageBox }> {
  return appearances.map((appearance) => ({
    ...appearance,
    rect: pageBoxOf(appearance.rect, visible),
  }));
}
