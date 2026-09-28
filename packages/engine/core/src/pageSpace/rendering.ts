import type { PageCoordinates } from './coordinates';
import type {
  AnnotationAppearanceManifest,
  AnnotationAppearanceRaster,
  AnnotationAppearancesResult,
} from '../dto/AnnotationRender';
import type { PageRenderTarget } from '../dto/PageRender';
import { pageBoxOf, pdfRectOf } from '../geometry/pageSpace';
import type { PdfRect } from '../geometry/primitives';

/** A page-space render target in the file's coordinates. `visible` is the page's visible box. */
export function pdfRenderTargetOf(
  target: PageRenderTarget<PageCoordinates>,
  visible: PdfRect,
): PageRenderTarget {
  return target.kind === 'rect' ? { ...target, rect: pdfRectOf(target.rect, visible) } : target;
}

/** Where each rendered appearance goes, in page space. */
export function pageAppearancesOf(
  result: AnnotationAppearancesResult,
  visible: PdfRect,
): AnnotationAppearancesResult<PageCoordinates> {
  return {
    ...result,
    appearances: result.appearances.map(
      (appearance): AnnotationAppearanceRaster<PageCoordinates> => ({
        ...appearance,
        rect: pageBoxOf(appearance.rect, visible),
      }),
    ),
  };
}

/** Where each appearance of a manifest goes, in page space. */
export function pageAppearanceManifestOf(
  manifest: AnnotationAppearanceManifest,
  visible: PdfRect,
): AnnotationAppearanceManifest<PageCoordinates> {
  return {
    ...manifest,
    appearances: manifest.appearances.map((entry) => ({
      ...entry,
      rect: pageBoxOf(entry.rect, visible),
    })),
  };
}
