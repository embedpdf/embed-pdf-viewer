import { normalizePdfRect, type PageMeasurementViewport } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { withScratch } from '../../../runtime/memory/scratch';
import { readUtf16String } from '../../../runtime/memory/strings';
import { readRectF } from '../../../runtime/memory/structs';
import { readMeasure } from './measureCodec';

export const CALIBRATION_NAME = 'EmbedPDF';
export function readViewports(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  page: Ptr,
): PageMeasurementViewport[] {
  const viewports: PageMeasurementViewport[] = [];
  for (let i = 0; i < fn.EPDFPage_CountViewports(page); i++) {
    const viewport = fn.EPDFPage_GetViewport(page, i);
    if (!viewport) continue;
    const bbox = withScratch(mem, 16, (p) =>
      fn.EPDFViewport_GetBBox(viewport, p) ? normalizePdfRect(readRectF(mem, p)) : undefined,
    );
    if (!bbox) continue;
    const name = readUtf16String(mem, (p, n) => fn.EPDFViewport_GetName(viewport, p, n));
    const measure = readMeasure(fn, mem, fn.EPDFViewport_GetMeasure(viewport));
    viewports.push({
      bbox,
      owned: name === CALIBRATION_NAME && (!measure || measure.subtype === 'rectilinear'),
      ...(name !== null ? { name } : {}),
      ...(measure ? { measure } : {}),
    });
  }
  return viewports;
}
