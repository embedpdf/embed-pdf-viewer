/** Slice reads, the page registry, page ⇄ PDF point conversion, the liveness
 *  and authority guards, and the page-target expansion. */
import { PluginError } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import { pageRefsEqual } from '@embedpdf/engine-core/runtime';
import type { PageRef, PdfPoint } from '@embedpdf/engine-core/runtime';

import type { PageScale, PageTarget } from '../contract';
import type { MeasurementContext } from './context';

export const LOADING: PageScale = {
  measure: null,
  source: 'default',
  ready: false,
  persistent: false,
};

export function createStore(ctx: MeasurementContext) {
  let disposed = false;
  ctx.cleanup(() => {
    disposed = true;
  });
  const state = () => ctx.getState();
  const meta = (page: PageRef) => ctx.document()?.pages.find((p) => pageRefsEqual(p.ref, page));
  const requireMeta = (page: PageRef) => {
    const layout = meta(page);
    if (!layout) throw new PluginError('not-found', 'measurement', 'no such page');
    return layout;
  };
  const isDisposed = () => disposed;
  const live = () => {
    if (disposed || !ctx.doc)
      throw new PluginError('not-ready', 'measurement', 'document not open');
    return ctx.doc;
  };
  const canCalibrate = () => ctx.doc?.security.allows('doc.annotate.modify') ?? false;
  const assertAllowed = () => {
    live();
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
      ? (ctx.document()?.pages ?? []).map((p) => p.ref)
      : Array.isArray(pages)
        ? (pages as readonly PageRef[])
        : [pages as PageRef];
  /** Unrotated page space (origin at the CropBox top-left, y down) → PDF user space. */
  const toPdf = (page: PageRef, point: Point): PdfPoint => {
    const crop = requireMeta(page).boxes.crop;
    return { x: crop.left + point.x, y: crop.top - point.y };
  };
  const toPage = (page: PageRef, point: PdfPoint): Point => {
    const crop = requireMeta(page).boxes.crop;
    return { x: point.x - crop.left, y: crop.top - point.y };
  };
  const scaleOf = (page: PageRef): PageScale =>
    state().pages[page.pageObjectNumber]?.scale ?? LOADING;
  return {
    state,
    meta,
    requireMeta,
    isDisposed,
    live,
    canCalibrate,
    assertAllowed,
    targets,
    toPdf,
    toPage,
    scaleOf,
  };
}
export type MeasurementStore = ReturnType<typeof createStore>;
