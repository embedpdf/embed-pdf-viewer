/**
 * The page's viewports into the slice. Calls serialize per page; refresh
 * epochs prevent an old read from replacing a newer scale. `connect` watches
 * the document for viewport changes, version moves and inserted pages.
 */
import { PluginError } from '@embedpdf/core';
import { serializeError } from '@embedpdf/engine-core/runtime';
import type { PageMeasurementViewport, PageRef } from '@embedpdf/engine-core/runtime';

import type { MeasurementConfig } from '../contract';
import { defaultMeasure, selectPageScale } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';

export function createViewportSync(
  ctx: MeasurementContext,
  { store, siblings }: Pick<MeasurementServices, 'store' | 'siblings'>,
  config: MeasurementConfig,
) {
  const { meta, isDisposed, live } = store;
  const { annotation } = siblings;
  const epochs = new Map<number, number>();
  const reading = new Map<number, Promise<void>>();
  ctx.cleanup(() => {
    epochs.clear();
  });

  const publish = (page: PageRef, viewports: PageMeasurementViewport[]) => {
    if (isDisposed()) return;
    const layout = meta(page);
    if (!layout) return;
    const fallback = defaultMeasure(config, layout.userUnit);
    annotation.setPageViewports(page, viewports, fallback);
    ctx.dispatch({
      type: 'PAGE_SCALE',
      page,
      viewports,
      scale: selectPageScale(viewports, layout.boxes.crop, fallback, !!ctx.doc?.page(page).measure),
    });
  };

  const refresh = (page: PageRef): Promise<void> => {
    const doc = live();
    const layout = meta(page);
    if (!layout) {
      return Promise.reject(new PluginError('not-found', 'measurement', 'no such page'));
    }
    const pon = page.pageObjectNumber;
    const epoch = (epochs.get(pon) ?? 0) + 1;
    epochs.set(pon, epoch);
    // Disable creation until calibration is known; never race a default into an imported viewport.
    annotation.setPageViewports(page, undefined, defaultMeasure(config, layout.userUnit));
    const previous = ctx.getState().pages[pon];
    ctx.dispatch({
      type: 'PAGE_SCALE',
      page,
      viewports: previous?.viewports ?? [],
      scale: {
        ...(previous?.scale ?? {
          measure: null,
          source: 'default',
          persistent: !!doc.page(page).measure,
        }),
        ready: false,
      },
    });
    const service = doc.page(page).measure;
    const request = (async () => {
      try {
        const viewports = service
          ? await service.viewports()
          : (ctx.getState().pages[pon]?.viewports ?? []);
        if (!isDisposed() && epochs.get(pon) === epoch) publish(page, viewports);
      } catch (error) {
        if (!isDisposed() && epochs.get(pon) === epoch) {
          ctx.dispatch({
            type: 'PAGE_SCALE',
            page,
            viewports: [],
            scale: {
              measure: null,
              source: 'default',
              ready: false,
              persistent: !!service,
              error: serializeError(error),
            },
          });
        }
        throw error;
      } finally {
        if (epochs.get(pon) === epoch) reading.delete(pon);
      }
    })();
    reading.set(pon, request);
    return request;
  };

  const ensureLoaded = (page: PageRef): Promise<void> => {
    const pon = page.pageObjectNumber;
    return (
      reading.get(pon) ??
      (ctx.getState().pages[pon]?.scale.ready ? Promise.resolve() : refresh(page))
    );
  };

  const connect = (): void => {
    const doc = ctx.doc;
    if (!doc) return;
    const hydrate = () => {
      for (const page of ctx.document()?.pages ?? []) void refresh(page.ref).catch(() => {});
    };
    ctx.cleanup(
      doc.events.subscribe((event) => {
        if (event.type === 'page.viewportsChanged') {
          void refresh(event.page).catch(() => {});
        } else if (event.type === 'stream.desynced' || event.type === 'document.versioned') {
          hydrate();
        }
      }),
    );
    // Covers pages inserted after this document-scoped instance was created.
    let pages = '';
    const reconcile = () => {
      const next = (ctx.document()?.pages ?? []).map((p) => p.ref.pageObjectNumber).join(',');
      if (next === pages) return;
      pages = next;
      for (const page of ctx.document()?.pages ?? []) {
        if (!ctx.getState().pages[page.ref.pageObjectNumber]) {
          void ensureLoaded(page.ref).catch(() => {});
        }
      }
    };
    ctx.cleanup(ctx.subscribe(reconcile));
    reconcile();
  };

  return { publish, refresh, ensureLoaded, connect };
}
export type MeasurementViewportSync = ReturnType<typeof createViewportSync>;
