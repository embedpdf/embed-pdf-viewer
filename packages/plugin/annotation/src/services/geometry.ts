import type { Rect, ViewEnv } from '@embedpdf/core-annotation';
import type { PdfRect } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';

/** A page's size in page (content) units, from its crop box. */
export const pageSizeOf = (crop: PdfRect): { width: number; height: number } => ({
  width: crop.right - crop.left,
  height: crop.top - crop.bottom,
});

/** Fold `zoom`/`rotation` host args into the core's ViewEnv (or none).
 *  `zoom` is the page's RELATIVE zoom (`transform.zoom`) — never the
 *  px-per-point `scale` (that one only converts CSS-px chrome settings). */
export const viewEnv = (zoom?: number, rotation?: number): ViewEnv | undefined =>
  zoom != null || rotation != null
    ? { zoom: zoom ?? 1, rotation: (rotation ?? 0) as ViewEnv['rotation'] }
    : undefined;

/** Page geometry as the document registry reports it: the crop box every
 *  PDF ⇄ page conversion in this plugin goes through. */
export function createPageGeometry(ctx: Pick<AnnotationContext, 'document'>) {
  const cropOf = (pon: number): PdfRect | null =>
    ctx.document()?.pages.find((p) => p.ref.pageObjectNumber === pon)?.boxes.crop ?? null;
  /** The page's box in content space (origin at the crop top-left) — the box
   *  pointer gestures clamp to, so annotations stay page-bound. */
  const pageBoxOf = (pon: number): Rect | undefined => {
    const crop = cropOf(pon);
    return crop ? { x: 0, y: 0, ...pageSizeOf(crop) } : undefined;
  };
  return { cropOf, pageBoxOf };
}

export type PageGeometry = ReturnType<typeof createPageGeometry>;
