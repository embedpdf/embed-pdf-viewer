/** The page registry, page ⇄ PDF point conversion, the authority guards, and the page-target expansion. */
import { PluginError } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type { PageRef, PdfPoint } from '@embedpdf/engine-core/runtime';

import type { PageTarget } from '../contract';
import type { MeasurementContext } from './context';

export function createStore(ctx: MeasurementContext) {
  const requirePage = (page: PageRef) => {
    const layout = ctx.getPage(page);
    if (!layout) throw new PluginError('not-found', 'measurement', 'no such page');
    return layout;
  };
  const canCalibrate = () => ctx.doc.security.allows('doc.annotate.modify');
  const assertAllowed = () => {
    if (!canCalibrate()) {
      throw new PluginError(
        'permission-denied',
        'measurement',
        'changing a scale requires doc.annotate.modify',
      );
    }
  };
  const targets = (pages: PageTarget): readonly PageRef[] =>
    pages === 'all'
      ? (ctx.document()?.pages ?? []).map((layout) => layout.ref)
      : Array.isArray(pages)
        ? (pages as readonly PageRef[])
        : [pages as PageRef];
  /** Page space ↔ PDF user space: the kernel's page geometry, never re-derived here. */
  const toPdf = (page: PageRef, point: Point): PdfPoint =>
    ctx.geometry.forPage(page).pageToPdf(point);
  const toPage = (page: PageRef, point: PdfPoint): Point =>
    ctx.geometry.forPage(page).pdfToPage(point);
  return { requirePage, canCalibrate, assertAllowed, targets, toPdf, toPage };
}
export type MeasurementStore = ReturnType<typeof createStore>;
