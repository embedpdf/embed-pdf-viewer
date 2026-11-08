import {
  CALIBRATION_VIEWPORT_NAME,
  normalizePdfRect,
  type PageMeasurementViewport,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { withScratch } from '../../../runtime/memory/scratch';
import { readUtf16String } from '../../../runtime/memory/strings';
import { readRectF } from '../../../runtime/memory/structs';
import { readMeasure } from './measureCodec';

/**
 * The page's viewports, read from its dictionary without loading the page
 * (the fork's raw viewport functions): cheap enough for every page of a layout.
 */
export function readViewports(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  doc: Ptr,
  pageIndex: number,
): PageMeasurementViewport<PdfCoordinates>[] {
  const viewports: PageMeasurementViewport<PdfCoordinates>[] = [];
  const count = fn.EPDFPage_CountViewportsRaw(doc, pageIndex);
  for (let i = 0; i < count; i++) {
    const viewport = fn.EPDFPage_GetViewportRaw(doc, pageIndex, i);
    if (!viewport) continue;
    try {
      const bbox = withScratch(mem, 16, (p) =>
        fn.EPDFViewport_GetBBox(viewport, p) ? normalizePdfRect(readRectF(mem, p)) : undefined,
      );
      if (!bbox) continue;
      const name = readUtf16String(mem, (p, n) => fn.EPDFViewport_GetName(viewport, p, n));
      const measure = readMeasure(fn, mem, fn.EPDFViewport_GetMeasure(viewport));
      viewports.push({
        bbox,
        owned:
          name === CALIBRATION_VIEWPORT_NAME && (!measure || measure.subtype === 'rectilinear'),
        name,
        measure: measure ?? null,
      });
    } finally {
      fn.EPDFViewport_Close(viewport);
    }
  }
  return viewports;
}
