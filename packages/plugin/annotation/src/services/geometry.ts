import { pageSpace } from '@embedpdf/core-geometry';
import type { Rect, ViewEnv } from '@embedpdf/core-annotation';
import type { PdfRect } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';

/** A page's size in page (content) units, from its crop box. */
export const pageSizeOf = (crop: PdfRect): { width: number; height: number } => {
  const { width, height } = pageSpace(crop);
  return { width, height };
};

/** Fold `zoom`/`rotation` host args into the core's ViewEnv (or none).
 *  `zoom` is the page's relative zoom (`transform.zoom`) — never the
 *  px-per-point `scale` (that one only converts CSS-px chrome settings). */
export const viewEnv = (zoom?: number, rotation?: number): ViewEnv | undefined =>
  zoom != null || rotation != null
    ? { zoom: zoom ?? 1, rotation: (rotation ?? 0) as ViewEnv['rotation'] }
    : undefined;

/** The crop box per page, as the document registry reports it — the input to
 *  `pageSpace` wherever this plugin converts outside the kernel's `ctx.geometry`. */
export function createCropLookup(ctx: Pick<AnnotationContext, 'document'>) {
  const cropOf = (pageObjectNumber: number): PdfRect | null =>
    ctx.document()?.pages.find((pageInfo) => pageInfo.ref.pageObjectNumber === pageObjectNumber)
      ?.boxes.crop ?? null;
  /** The page's box in content space (origin at the crop top-left) — the box
   *  pointer gestures clamp to, so annotations stay page-bound. */
  const pageBoxOf = (pageObjectNumber: number): Rect | undefined => {
    const crop = cropOf(pageObjectNumber);
    return crop ? { x: 0, y: 0, ...pageSizeOf(crop) } : undefined;
  };
  return { cropOf, pageBoxOf };
}

export type CropLookup = ReturnType<typeof createCropLookup>;
