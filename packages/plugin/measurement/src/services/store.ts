/** The page registry, the calibrate twin, and the page-target expansion. */
import { PluginError } from '@embedpdf/core';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { PageTarget } from '../contract';
import type { MeasurementContext } from './context';

/** Changing a page's scale rewrites its measurement annotations. */
export const SCALE_PERMISSION = 'doc.annotate.modify';

export function createStore(ctx: MeasurementContext) {
  const requirePage = (page: PageRef) => {
    const layout = ctx.getPage(page);
    if (!layout) throw new PluginError('not-found', 'measurement', 'no such page');
    return layout;
  };
  const canCalibrate = () => ctx.allows(SCALE_PERMISSION);
  const targets = (pages: PageTarget): readonly PageRef[] =>
    pages === 'all'
      ? (ctx.document()?.pages ?? []).map((layout) => layout.ref)
      : Array.isArray(pages)
        ? (pages as readonly PageRef[])
        : [pages as PageRef];
  return { requirePage, canCalibrate, targets };
}
export type MeasurementStore = ReturnType<typeof createStore>;
