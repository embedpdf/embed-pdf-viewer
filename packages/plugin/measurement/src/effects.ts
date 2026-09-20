import type { PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  assertWritableMeasure,
  EngineError,
  EngineErrorCode,
  PermissionDenied,
  measurementPoint,
  pageRefsEqual,
  serializeError,
} from '@embedpdf/engine-core/runtime';
import type { PageRef, PdfMeasure, PageMeasurementViewport } from '@embedpdf/engine-core/runtime';
import { defaultMeasure, selectPageScale } from './scale';
import type {
  CalibrationRequest,
  MeasurementAction,
  MeasurementConfig,
  MeasurementState,
  ScaleChangeReport,
  SetScaleOptions,
} from './types';

type Context = PluginContext<MeasurementState, MeasurementAction>;
/** All engine IO and cross-plugin lifecycle work lives here. Calls serialize
 * per page; refresh epochs prevent an old read from replacing a newer scale. */
export function createMeasurementEffects(ctx: Context, config: MeasurementConfig) {
  const anno = ctx.get(AnnotationToken);
  const interaction = ctx.get(InteractionToken);
  let disposed = false;
  const epochs = new Map<number, number>();
  const reading = new Map<number, Promise<void>>();
  const queues = new Map<number, Promise<unknown>>();
  const calibrationListeners = new Set<(r: CalibrationRequest) => void>();
  const scaleListeners = new Set<(e: { page: PageRef; report: ScaleChangeReport }) => void>();
  const meta = (page: PageRef) => ctx.document()?.pages.find((p) => pageRefsEqual(p.ref, page));
  const live = () => {
    if (disposed || !ctx.doc) {
      throw new EngineError(EngineErrorCode.DocNotOpen);
    }
  };
  const assertAllowed = () => {
    live();
    if (!ctx.doc!.security.allows('doc.annotate.modify')) {
      throw new PermissionDenied('doc.annotate.modify', 'measurement');
    }
  };
  const publish = (page: PageRef, viewports: PageMeasurementViewport[]) => {
    if (disposed) {
      return;
    }
    const layout = meta(page);
    if (!layout) {
      return;
    }
    const fallback = defaultMeasure(config, layout.userUnit);
    anno.setPageViewports(page, viewports, fallback);
    ctx.dispatch({
      type: 'PAGE_SCALE',
      page,
      viewports,
      scale: selectPageScale(viewports, layout.boxes.crop, fallback, !!ctx.doc?.page(page).measure),
    });
  };
  const refresh = (page: PageRef): Promise<void> => {
    live();
    const layout = meta(page);
    if (!layout) {
      return Promise.reject(new EngineError(EngineErrorCode.NotFound, 'Page not found'));
    }
    const pon = page.pageObjectNumber;
    const epoch = (epochs.get(pon) ?? 0) + 1;
    epochs.set(pon, epoch);
    // Disable creation until calibration is known; never race a default into an imported viewport.
    anno.setPageViewports(page, undefined, defaultMeasure(config, layout.userUnit));
    const previous = ctx.getState().pages[pon];
    ctx.dispatch({
      type: 'PAGE_SCALE',
      page,
      viewports: previous?.viewports ?? [],
      scale: {
        ...(previous?.scale ?? {
          measure: null,
          source: 'default',
          persistent: !!ctx.doc!.page(page).measure,
        }),
        ready: false,
      },
    });
    const service = ctx.doc!.page(page).measure;
    const request = (async () => {
      try {
        const viewports = service
          ? await service.viewports()
          : (ctx.getState().pages[pon]?.viewports ?? []);
        if (!disposed && epochs.get(pon) === epoch) {
          publish(page, viewports);
        }
      } catch (error) {
        if (!disposed && epochs.get(pon) === epoch) {
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
        if (epochs.get(pon) === epoch) {
          reading.delete(pon);
        }
      }
    })();
    reading.set(pon, request);
    return request;
  };
  const prepare = (page: PageRef) => {
    const pon = page.pageObjectNumber;
    return (
      reading.get(pon) ??
      (ctx.getState().pages[pon]?.scale.ready ? Promise.resolve() : refresh(page))
    );
  };
  const enqueue = (
    pon: number,
    action: () => Promise<ScaleChangeReport>,
  ): Promise<ScaleChangeReport> => {
    const result = (queues.get(pon) ?? Promise.resolve()).catch(() => {}).then(action);
    queues.set(pon, result);
    void result
      .finally(() => {
        if (queues.get(pon) === result) {
          queues.delete(pon);
        }
      })
      .catch(() => {});
    return result;
  };
  const save = async (
    page: PageRef,
    scale: PdfMeasure,
    opts: SetScaleOptions,
  ): Promise<ScaleChangeReport> => {
    assertAllowed();
    await prepare(page);
    assertAllowed();
    const service = ctx.doc!.page(page).measure;
    if (service) {
      await service.setScale(scale);
      live();
      await refresh(page);
    } else {
      const layout = meta(page)!;
      const old = ctx.getState().pages[page.pageObjectNumber]?.viewports ?? [];
      publish(page, [
        ...old.filter((v) => !v.owned),
        { bbox: layout.boxes.crop, name: 'EmbedPDF', owned: true, measure: scale },
      ]);
    }
    live();
    const report =
      opts.recalculate === false
        ? { page, scale, updated: [], skipped: [], failed: [] }
        : await anno.remeasurePage(page, scale);
    live();
    for (const cb of scaleListeners) {
      try {
        cb({ page, report });
      } catch {
        /* observers do not roll back a committed scale */
      }
    }
    return report;
  };
  const change = async (
    pages: readonly PageRef[],
    measure: (page: PageRef) => PdfMeasure,
    opts: SetScaleOptions = {},
  ): Promise<ScaleChangeReport[]> => {
    assertAllowed();
    ctx.dispatch({ type: 'PENDING', delta: 1 });
    try {
      const reports = await Promise.all(
        pages.map((page) =>
          enqueue(page.pageObjectNumber, async () => {
            try {
              await prepare(page);
              const scale = measure(page);
              assertWritableMeasure(scale);
              return await save(page, scale, opts);
            } catch (error) {
              if (!opts.allPages) {
                throw error;
              }
              return {
                page,
                updated: [],
                skipped: [],
                failed: [],
                scaleError: serializeError(error),
              };
            }
          }),
        ),
      );
      live();
      ctx.dispatch({ type: 'REPORTS', reports });
      return reports;
    } finally {
      if (!disposed) {
        ctx.dispatch({ type: 'PENDING', delta: -1 });
      }
    }
  };
  const start = () => {
    const doc = ctx.doc;
    if (!doc) {
      return;
    }
    ctx.cleanup(() => {
      disposed = true;
      epochs.clear();
      queues.clear();
      calibrationListeners.clear();
      scaleListeners.clear();
    });
    ctx.cleanup(
      anno.onDraftCaptured((draft) => {
        if (draft.tool !== 'calibrate' || !doc.security.allows('doc.annotate.modify')) {
          return;
        }
        const a = measurementPoint(draft.from);
        const b = measurementPoint(draft.to);
        const userSpaceLength = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(userSpaceLength > 0)) {
          return;
        }
        const request = { page: draft.page, from: a, to: b, userSpaceLength };
        interaction.activateTool('pointer');
        ctx.dispatch({ type: 'CALIBRATION', request });
        for (const cb of calibrationListeners) {
          try {
            cb(request);
          } catch {
            /* observers */
          }
        }
      }),
    );
    const hydrate = () => {
      for (const page of ctx.document()?.pages ?? []) {
        void refresh(page.ref).catch(() => {});
      }
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
      if (next === pages) {
        return;
      }
      pages = next;
      for (const page of ctx.document()?.pages ?? [])
        if (!ctx.getState().pages[page.ref.pageObjectNumber]) {
          void prepare(page.ref).catch(() => {});
        }
    };
    ctx.cleanup(ctx.subscribe(reconcile));
    reconcile();
  };
  return { start, prepare, change, calibrationListeners, scaleListeners };
}

export type MeasurementEffects = ReturnType<typeof createMeasurementEffects>;
