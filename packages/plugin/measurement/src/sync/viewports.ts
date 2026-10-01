/**
 * The pages' viewports: a page mirror re-read whenever a confirmed
 * `pages.scaleSet` names a loaded page, from this session or another
 * (stream gaps and version moves re-read every loaded page). Its `changed`
 * callback tells the annotation plugin a page's viewports, and a new
 * `defaultScale` setting tells it again. `connect` loads every page in the
 * registry, including pages inserted later.
 */
import {
  PluginError,
  memoByKey,
  toPageRef,
  type OperationOptions,
  type PageInfo,
} from '@embedpdf/core';
import { serializeError } from '@embedpdf/engine-core/runtime';
import type { PageMeasurementViewport, PageRef } from '@embedpdf/engine-core/runtime';

import type { PageScale } from '../contract';
import { clearLoadError, pageScaleOf, recordLoadError } from '../model';
import { defaultMeasure } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';

/** The scale of a page index past the end: none, and never ready. */
const NO_PAGE: PageScale = Object.freeze({
  measure: null,
  source: 'default',
  ready: false,
  persistent: false,
});

export function createViewportSync(
  ctx: MeasurementContext,
  { siblings }: Pick<MeasurementServices, 'siblings'>,
) {
  const { annotation } = siblings;
  const settings = ctx.settings();
  /** The scale of a page without one: the `defaultScale` setting, in the page's user unit. */
  const fallbackOf = (layout: PageInfo | null) =>
    defaultMeasure(settings.get().defaultScale, layout?.userUnit ?? 1);

  const viewports = ctx.pageMirror<readonly PageMeasurementViewport[]>({
    name: 'viewports',
    load: async (doc, page) => {
      ctx.assertPageRef(page);
      const service = doc.page(page).measure;
      // Without a page measure service, scales live for the session only.
      if (!service) return ctx.state.get().localViewports[page.objectNumber] ?? [];
      try {
        return (await service.listViewports()).viewports;
      } catch (error) {
        ctx.state.update(recordLoadError, page.objectNumber, serializeError(error));
        throw error;
      }
    },
    affected: (event) => (event.type === 'pages.scaleSet' ? [event.page] : null),
    changed: ({ page, cause, next }) => {
      if (cause === 'drop' || next === undefined) return;
      ctx.state.update(clearLoadError, page.objectNumber);
      const layout = ctx.getPage(page);
      if (layout) annotation.setPageViewports(page, [...next], fallbackOf(layout));
    },
  });

  /** The engine can persist a scale into the document. */
  const isPersistent = (page: PageRef): boolean => ctx.doc.page(page).measure !== undefined;

  /** The page's public scale, the same object until its viewports, read state or layout change. */
  const scaleOfPage = memoByKey(
    (pageObjectNumber: number) => {
      const page = toPageRef(pageObjectNumber);
      const layout = ctx.getPage(page);
      return [
        viewports.get(page),
        viewports.getStatus(page),
        ctx.state.get().loadErrors[pageObjectNumber],
        layout,
        layout ? isPersistent(page) : false,
        settings.get().defaultScale,
      ] as const;
    },
    (_pageObjectNumber, pageViewports, status, error, layout, persistent): PageScale =>
      pageScaleOf({
        viewports: pageViewports,
        status,
        error,
        size: layout?.size,
        fallback: fallbackOf(layout),
        persistent,
      }),
  );
  /** A page's scale, by ref or index; a page that isn't there has none, and isn't ready. */
  const scaleOf = (page: PageRef | number): PageScale => {
    if (typeof page !== 'number') return scaleOfPage(page.objectNumber);
    const layout = ctx.getPage(page);
    return layout ? scaleOfPage(layout.ref.objectNumber) : NO_PAGE;
  };

  const ensureLoaded = (page: PageRef | number, options?: OperationOptions): Promise<void> => {
    const layout = ctx.getPage(page);
    if (!layout) {
      return Promise.reject(new PluginError('not-found', 'measurement', 'no such page'));
    }
    return ctx.cancellable(options?.signal, viewports.ensureLoaded(layout.ref));
  };

  const connect = (): void => {
    const hydrate = (layouts: readonly PageInfo[] | undefined) => {
      for (const layout of layouts ?? []) {
        if (viewports.getStatus(layout.ref) !== 'idle') continue;
        void viewports.ensureLoaded(layout.ref).catch(() => {
          /* reported through getPageScale(page).error */
        });
      }
    };
    hydrate(ctx.document()?.pages);
    ctx.watch(() => ctx.document()?.pages, hydrate);
    // A new default scale reaches the pages without one: the annotation
    // plugin measures new drawings on them with it.
    ctx.listen(settings.api.onSettingsChanged, ({ changed }) => {
      if (!changed.includes('defaultScale')) return;
      for (const layout of ctx.document()?.pages ?? []) {
        const known = viewports.get(layout.ref);
        if (known) annotation.setPageViewports(layout.ref, [...known], fallbackOf(layout));
      }
    });
  };

  return {
    ensureLoaded,
    scaleOf,
    /** Re-read one page; for session-only scales, which no engine event announces. */
    refresh: (page: PageRef) => viewports.refresh(page),
    connect,
  };
}
export type MeasurementViewportSync = ReturnType<typeof createViewportSync>;
