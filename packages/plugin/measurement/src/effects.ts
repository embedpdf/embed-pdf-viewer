import type { PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  assertWritableMeasure,
  EngineError,
  EngineErrorCode,
  PermissionDenied,
  measurementPoint,
  serializeError,
} from '@embedpdf/engine-core/runtime';
import type { PdfMeasure, PageMeasurementViewport } from '@embedpdf/engine-core/runtime';
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
  const scaleListeners = new Set<(e: { pon: number; report: ScaleChangeReport }) => void>();
  const meta = (pon: number) => ctx.document()?.pages.find((p) => p.pageObjectNumber === pon);
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
  const publish = (pon: number, viewports: PageMeasurementViewport[]) => {
    if (disposed) {
      return;
    }
    const page = meta(pon);
    if (!page) {
      return;
    }
    const fallback = defaultMeasure(config, page.userUnit);
    anno.setPageViewports(pon, viewports, fallback);
    ctx.dispatch({
      type: 'PAGE_SCALE',
      pon,
      viewports,
      scale: selectPageScale(viewports, page.boxes.crop, fallback, !!ctx.doc?.page(pon).measure),
    });
  };
  const refresh = (pon: number): Promise<void> => {
    live();
    const page = meta(pon);
    if (!page) {
      return Promise.reject(new EngineError(EngineErrorCode.NotFound, 'Page not found'));
    }
    const epoch = (epochs.get(pon) ?? 0) + 1;
    epochs.set(pon, epoch);
    // Disable creation until calibration is known; never race a default into an imported viewport.
    anno.setPageViewports(pon, undefined, defaultMeasure(config, page.userUnit));
    const previous = ctx.getState().pages[pon];
    ctx.dispatch({
      type: 'PAGE_SCALE',
      pon,
      viewports: previous?.viewports ?? [],
      scale: {
        ...(previous?.scale ?? {
          measure: null,
          source: 'default',
          persistent: !!ctx.doc!.page(pon).measure,
        }),
        ready: false,
      },
    });
    const service = ctx.doc!.page(pon).measure;
    const request = (async () => {
      try {
        const viewports = service
          ? await service.viewports()
          : (ctx.getState().pages[pon]?.viewports ?? []);
        if (!disposed && epochs.get(pon) === epoch) {
          publish(pon, viewports);
        }
      } catch (error) {
        if (!disposed && epochs.get(pon) === epoch) {
          ctx.dispatch({
            type: 'PAGE_SCALE',
            pon,
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
  const prepare = (pon: number) =>
    reading.get(pon) ?? (ctx.getState().pages[pon]?.scale.ready ? Promise.resolve() : refresh(pon));
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
    pon: number,
    scale: PdfMeasure,
    opts: SetScaleOptions,
  ): Promise<ScaleChangeReport> => {
    assertAllowed();
    await prepare(pon);
    assertAllowed();
    const service = ctx.doc!.page(pon).measure;
    if (service) {
      await service.setScale(scale);
      live();
      await refresh(pon);
    } else {
      const page = meta(pon)!;
      const old = ctx.getState().pages[pon]?.viewports ?? [];
      publish(pon, [
        ...old.filter((v) => !v.owned),
        { bbox: page.boxes.crop, name: 'EmbedPDF', owned: true, measure: scale },
      ]);
    }
    live();
    const report =
      opts.recalculate === false
        ? { pon, scale, updated: [], skipped: [], failed: [] }
        : await anno.remeasurePage(pon, scale);
    live();
    for (const cb of scaleListeners) {
      try {
        cb({ pon, report });
      } catch {
        /* observers do not roll back a committed scale */
      }
    }
    return report;
  };
  const change = async (
    pons: number[],
    measure: (pon: number) => PdfMeasure,
    opts: SetScaleOptions = {},
  ): Promise<ScaleChangeReport[]> => {
    assertAllowed();
    ctx.dispatch({ type: 'PENDING', delta: 1 });
    try {
      const reports = await Promise.all(
        pons.map((pon) =>
          enqueue(pon, async () => {
            try {
              await prepare(pon);
              const scale = measure(pon);
              assertWritableMeasure(scale);
              return await save(pon, scale, opts);
            } catch (error) {
              if (!opts.allPages) {
                throw error;
              }
              return {
                pon,
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
        const request = { pon: draft.pon, from: a, to: b, userSpaceLength };
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
        void refresh(page.pageObjectNumber).catch(() => {});
      }
    };
    ctx.cleanup(
      doc.events.subscribe((event) => {
        if (event.type === 'page.viewportsChanged') {
          void refresh(event.pageObjectNumber).catch(() => {});
        } else if (event.type === 'stream.desynced' || event.type === 'document.versioned') {
          hydrate();
        }
      }),
    );
    // Covers pages inserted after this document-scoped instance was created.
    let pages = '';
    const reconcile = () => {
      const next = (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber).join(',');
      if (next === pages) {
        return;
      }
      pages = next;
      for (const page of ctx.document()?.pages ?? [])
        if (!ctx.getState().pages[page.pageObjectNumber]) {
          void prepare(page.pageObjectNumber).catch(() => {});
        }
    };
    ctx.cleanup(ctx.subscribe(reconcile));
    reconcile();
  };
  return { start, prepare, change, calibrationListeners, scaleListeners };
}

export type MeasurementEffects = ReturnType<typeof createMeasurementEffects>;
