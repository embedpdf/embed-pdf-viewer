/** The page registry, the calibrate twin, and the page-target expansion. */
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { PageTarget } from '../contract';
import type { MeasurementContext } from './context';

/** Changing a page's scale rewrites its measurement annotations. */
export const SCALE_PERMISSION = 'doc.annotate.modify';

export function createStore(ctx: MeasurementContext) {
  /** A page argument of a verb, as a ref or an index: the page, or `not-found`. */
  const requirePage = (page: PageRef | number) => ctx.pageOf(page);
  const canCalibrate = () => ctx.allows(SCALE_PERMISSION);
  /** The pages a verb changes, each resolved: a page that isn't there refuses the whole call. */
  const targets = (pages: PageTarget): readonly PageRef[] => {
    if (pages === 'all') return (ctx.document()?.pages ?? []).map((layout) => layout.ref);
    const list: readonly (PageRef | number)[] = Array.isArray(pages)
      ? pages
      : [pages as PageRef | number];
    return list.map((page) => ctx.pageOf(page).ref);
  };
  return { requirePage, canCalibrate, targets };
}
export type MeasurementStore = ReturnType<typeof createStore>;
