import type { Rect, ViewEnv } from '@embedpdf/core-annotation';
import type { PdfRect, PdfSize } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';

/** Fold `zoom`/`rotation` host args into the core's ViewEnv (or none).
 *  `zoom` is the page's relative zoom (`transform.zoom`) — never the
 *  px-per-point `scale` (that one only converts CSS-px chrome settings). */
export const viewEnv = (zoom?: number, rotation?: number): ViewEnv | undefined =>
  zoom != null || rotation != null
    ? { zoom: zoom ?? 1, rotation: (rotation ?? 0) as ViewEnv['rotation'] }
    : undefined;

/** Each page's size and crop box, as the document registry reports them. */
export function createPageLookup(ctx: Pick<AnnotationContext, 'document'>) {
  const layoutOf = (pageObjectNumber: number) =>
    ctx.document()?.pages.find((pageInfo) => pageInfo.ref.pageObjectNumber === pageObjectNumber);
  const sizeOf = (pageObjectNumber: number): PdfSize | null =>
    layoutOf(pageObjectNumber)?.size ?? null;
  /** The crop box in the file's numbers, for Acrobat scripts, which speak them. */
  const cropOf = (pageObjectNumber: number): PdfRect | null =>
    layoutOf(pageObjectNumber)?.pdfCropBox ?? null;
  /** The page's box — the box pointer gestures clamp to, so annotations stay
   *  page-bound. */
  const pageBoxOf = (pageObjectNumber: number): Rect | undefined => {
    const size = sizeOf(pageObjectNumber);
    return size ? { x: 0, y: 0, ...size } : undefined;
  };
  return { sizeOf, cropOf, pageBoxOf };
}

export type PageLookup = ReturnType<typeof createPageLookup>;
