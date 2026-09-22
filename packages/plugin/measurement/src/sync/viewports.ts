/**
 * The pages' viewports: a page mirror re-read whenever a confirmed
 * `page.viewportsChanged` names a loaded page, from this session or another
 * (stream gaps and version moves re-read every loaded page). Its `changed`
 * callback is the one place the annotation plugin learns a page's viewports.
 * `connect` loads every page in the registry, including pages inserted later.
 */
import { PluginError, memoByKey, toPageRef, type PageInfo } from '@embedpdf/core';
import { serializeError } from '@embedpdf/engine-core/runtime';
import type { PageMeasurementViewport, PageRef } from '@embedpdf/engine-core/runtime';

import type { MeasurementConfig, PageScale } from '../contract';
import { clearLoadError, pageScaleOf, recordLoadError } from '../model';
import { defaultMeasure } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';

export function createViewportSync(
  ctx: MeasurementContext,
  { siblings }: Pick<MeasurementServices, 'siblings'>,
  config: MeasurementConfig,
) {
  const { annotation } = siblings;
  const fallbackOf = (layout: PageInfo | null) => defaultMeasure(config, layout?.userUnit ?? 1);

  const viewports = ctx.pageMirror<readonly PageMeasurementViewport[]>({
    name: 'viewports',
    load: async (doc, page) => {
      ctx.assertPageRef(page);
      const service = doc.page(page).measure;
      // Without a page measure service, scales live for the session only.
      if (!service) return ctx.state.get().localViewports[page.pageObjectNumber] ?? [];
      try {
        return await service.viewports();
      } catch (error) {
        ctx.state.update(recordLoadError, page.pageObjectNumber, serializeError(error));
        throw error;
      }
    },
    affected: (event) => (event.type === 'page.viewportsChanged' ? [event.page] : null),
    changed: ({ page, cause, next }) => {
      if (cause === 'drop' || next === undefined) return;
      ctx.state.update(clearLoadError, page.pageObjectNumber);
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
      ] as const;
    },
    (_pageObjectNumber, pageViewports, status, error, layout, persistent): PageScale =>
      pageScaleOf({
        viewports: pageViewports,
        status,
        error,
        crop: layout?.boxes.crop,
        fallback: fallbackOf(layout),
        persistent,
      }),
  );
  const scaleOf = (page: PageRef): PageScale => scaleOfPage(page.pageObjectNumber);

  const ensureLoaded = (page: PageRef): Promise<void> => {
    if (!ctx.getPage(page)) {
      return Promise.reject(new PluginError('not-found', 'measurement', 'no such page'));
    }
    return viewports.ensureLoaded(page);
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
