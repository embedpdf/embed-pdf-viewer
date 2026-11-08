/**
 * The pages' viewports. Each page's layout carries them
 * (`PageLayout.viewports`), and the page list keeps them current: a scale
 * change's own prediction, its event from this session or another, a page
 * insert or delete. Where the engine can't keep a scale, the session keeps
 * its own (`localViewports`). `connect` hands the annotation plugin each
 * page's viewports, again whenever a page's viewports change, and for every page on a
 * new `defaultScale` setting.
 */
import { PluginError, memoByKey, toPageRef, type PageInfo } from '@embedpdf/core';
import type { PageMeasurementViewport, PageRef } from '@embedpdf/engine-core/runtime';

import type { PageScale } from '../contract';
import { selectPageScale } from '../model';
import { defaultMeasure } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';

/** The scale of a page index past the end: none, and never ready. */
const NO_PAGE: PageScale = Object.freeze({
  measure: null,
  source: 'default',
  ready: false,
  persistent: false,
});

const NO_VIEWPORTS: readonly PageMeasurementViewport[] = Object.freeze([]);

export function createViewportSync(
  ctx: MeasurementContext,
  { siblings }: Pick<MeasurementServices, 'siblings'>,
) {
  const { annotation } = siblings;
  const settings = ctx.settings();
  /** The scale of a page without one: the `defaultScale` setting, in the page's user unit. */
  const fallbackOf = (layout: PageInfo) =>
    defaultMeasure(settings.get().defaultScale, layout.userUnit);

  /** The engine can persist a scale into the document. */
  const isPersistent = (page: PageRef): boolean => ctx.doc.page(page).measure !== undefined;

  /** A page's viewports: its layout's, or the session's own where the engine keeps none. */
  const viewportsOf = (layout: PageInfo): readonly PageMeasurementViewport[] =>
    isPersistent(layout.ref)
      ? (layout.viewports ?? NO_VIEWPORTS)
      : (ctx.state.get().localViewports[layout.ref.objectNumber] ?? NO_VIEWPORTS);

  /** The page's public scale, the same object until its layout, viewports or the default change. */
  const scaleOfPage = memoByKey(
    (pageObjectNumber: number) => {
      const layout = ctx.getPage(toPageRef(pageObjectNumber));
      return [
        layout,
        layout ? viewportsOf(layout) : NO_VIEWPORTS,
        layout ? isPersistent(layout.ref) : false,
        settings.get().defaultScale,
      ] as const;
    },
    (_pageObjectNumber, layout, viewports, persistent): PageScale =>
      layout ? selectPageScale(viewports, layout.size, fallbackOf(layout), persistent) : NO_PAGE,
  );
  /** A page's scale, by ref or index; a page that isn't there has none, and isn't ready. */
  const scaleOf = (page: PageRef | number): PageScale => {
    if (typeof page !== 'number') return scaleOfPage(page.objectNumber);
    const layout = ctx.getPage(page);
    return layout ? scaleOfPage(layout.ref.objectNumber) : NO_PAGE;
  };

  /** A page's scale is known as soon as the page is: its layout carries it. */
  const ensureLoaded = (page: PageRef | number): Promise<void> =>
    ctx.getPage(page)
      ? Promise.resolve()
      : Promise.reject(new PluginError('not-found', 'measurement', 'no such page'));

  const connect = (): void => {
    /** What the annotation plugin was last told, by page: the same array isn't told again. */
    const told = new Map<number, readonly PageMeasurementViewport[]>();
    const tell = (layout: PageInfo, always = false) => {
      const viewports = viewportsOf(layout);
      if (!always && told.get(layout.ref.objectNumber) === viewports) return;
      told.set(layout.ref.objectNumber, viewports);
      annotation.setPageViewports(layout.ref, [...viewports], fallbackOf(layout));
    };
    const tellChanged = () => {
      for (const layout of ctx.document()?.pages ?? []) tell(layout);
    };
    tellChanged();
    ctx.watch(() => ctx.document()?.pages, tellChanged);
    ctx.watch(() => ctx.state.get().localViewports, tellChanged);
    // A new default scale reaches the pages without one: the annotation
    // plugin measures new drawings on them with it.
    ctx.listen(settings.api.onSettingsChanged, ({ changedKeys }) => {
      if (!changedKeys.includes('defaultScale')) return;
      for (const layout of ctx.document()?.pages ?? []) tell(layout, true);
    });
  };

  return { ensureLoaded, scaleOf, isPersistent, connect };
}
export type MeasurementViewportSync = ReturnType<typeof createViewportSync>;
