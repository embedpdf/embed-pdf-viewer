/**
 * Scale writes. Every change serializes per page, loads the page first, and
 * re-measures the page's measurement annotations unless told not to. A
 * multi-page change reports per-page failures; a single-page change rejects.
 */
import { PluginError, toPluginError } from '@embedpdf/core';
import {
  assertWritableMeasure,
  measureFromKnownLength,
  measureFromRatio,
  measurementPoint,
  pageRefsEqual,
  serializeError,
} from '@embedpdf/engine-core/runtime';
import type { PageRef, PdfMeasure } from '@embedpdf/engine-core/runtime';

import type {
  CalibrateInput,
  MeasurementCapability,
  MeasurementConfig,
  PageTarget,
  ScaleChangeOptions,
  ScaleChangeReport,
} from '../contract';
import type { MeasurementScaleReads } from '../read/scale';
import { defaultMeasure, withAreaUnit, withPrecision, withUnit } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';
import type { MeasurementViewportSync } from '../sync/viewports';

export function createScaleWrites(
  ctx: MeasurementContext,
  { events, store, siblings }: Pick<MeasurementServices, 'events' | 'store' | 'siblings'>,
  config: MeasurementConfig,
  { presets }: Pick<MeasurementScaleReads, 'presets'>,
  {
    publish,
    refresh,
    ensureLoaded,
  }: Pick<MeasurementViewportSync, 'publish' | 'refresh' | 'ensureLoaded'>,
) {
  const { scaleChanged, calibrationCompleted } = events;
  const { state, meta, requireMeta, isDisposed, live, assertAllowed, targets, toPdf } = store;
  const { annotation } = siblings;
  const queues = new Map<number, Promise<unknown>>();
  ctx.cleanup(() => {
    queues.clear();
  });

  const enqueue = (
    pon: number,
    action: () => Promise<ScaleChangeReport>,
  ): Promise<ScaleChangeReport> => {
    const result = (queues.get(pon) ?? Promise.resolve()).catch(() => {}).then(action);
    queues.set(pon, result);
    void result
      .finally(() => {
        if (queues.get(pon) === result) queues.delete(pon);
      })
      .catch(() => {});
    return result;
  };

  /** Write one page's scale (`null` = back to the default) and re-measure. */
  const save = async (
    page: PageRef,
    scale: PdfMeasure | null,
    opts: ScaleChangeOptions,
  ): Promise<ScaleChangeReport> => {
    assertAllowed();
    await ensureLoaded(page);
    assertAllowed();
    const service = live().page(page).measure;
    if (service) {
      await service.setScale(scale);
      live();
      await refresh(page);
    } else {
      const layout = requireMeta(page);
      const old = state().pages[page.pageObjectNumber]?.viewports ?? [];
      publish(page, [
        ...old.filter((v) => !v.owned),
        ...(scale
          ? [{ bbox: layout.boxes.crop, name: 'EmbedPDF', owned: true, measure: scale }]
          : []),
      ]);
    }
    live();
    const effective = scale ?? defaultMeasure(config, requireMeta(page).userUnit);
    const report =
      opts.recalculate === false
        ? { page, scale: effective, updated: [], skipped: [], failed: [] }
        : await annotation.remeasurePage(page, effective);
    live();
    scaleChanged.emit({ page, report });
    return report;
  };

  const change = async (
    pages: PageTarget,
    measure: (page: PageRef) => PdfMeasure | null,
    opts: ScaleChangeOptions = {},
  ): Promise<readonly ScaleChangeReport[]> => {
    assertAllowed();
    const target = targets(pages);
    // One page: a failure rejects. Several: each page reports its own outcome.
    const tolerant = pages === 'all' || target.length > 1;
    ctx.dispatch({ type: 'PENDING', delta: 1 });
    try {
      const reports = await Promise.all(
        target.map((page) =>
          enqueue(page.pageObjectNumber, async () => {
            try {
              await ensureLoaded(page);
              const scale = measure(page);
              if (scale) assertWritableMeasure(scale);
              return await save(page, scale, opts);
            } catch (error) {
              if (!tolerant) throw toPluginError('measurement', error);
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
      if (!isDisposed()) ctx.dispatch({ type: 'PENDING', delta: -1 });
    }
  };

  /** The page's current rectilinear scale, for unit and precision edits. */
  const rectilinearOf = (page: PageRef): PdfMeasure => {
    const scale = state().pages[page.pageObjectNumber]?.scale.measure;
    if (!scale || scale.subtype !== 'RL') {
      throw new PluginError(
        'not-ready',
        'measurement',
        'calibrate this page before changing its units or precision',
      );
    }
    return scale;
  };

  const calibrate = async (
    input: CalibrateInput,
    opts: ScaleChangeOptions & { applyTo?: PageTarget } = {},
  ): Promise<readonly ScaleChangeReport[]> => {
    const a = measurementPoint(toPdf(input.page, input.from));
    const b = measurementPoint(toPdf(input.page, input.to));
    let scale: PdfMeasure;
    try {
      scale = measureFromKnownLength(Math.hypot(b.x - a.x, b.y - a.y), input.distance);
    } catch (error) {
      throw new PluginError(
        'invalid-input',
        'measurement',
        String((error as Error).message ?? error),
      );
    }
    const { applyTo, ...rest } = opts;
    const reports = await change(applyTo ?? input.page, () => scale, rest);
    const request = state().calibration;
    if (request && pageRefsEqual(request.page, input.page)) {
      ctx.dispatch({ type: 'CALIBRATION', request: null });
    }
    calibrationCompleted.emit({ page: input.page });
    return reports;
  };

  return {
    api: {
      setScale: (pages, measure, opts) => change(pages, () => measure, opts),
      calibrate,
      setUnit: (pages, unit, opts) => change(pages, (p) => withUnit(rectilinearOf(p), unit), opts),
      setAreaUnit: (pages, unit, opts) =>
        change(pages, (p) => withAreaUnit(rectilinearOf(p), unit), opts),
      setPrecision: (pages, precision, opts) =>
        change(pages, (p) => withPrecision(rectilinearOf(p), precision), opts),
      setPreset: (pages, presetId, opts) => {
        const preset = presets.find((p) => p.id === presetId);
        if (!preset) {
          return Promise.reject(
            new PluginError('not-found', 'measurement', `unknown scale preset '${presetId}'`),
          );
        }
        return change(
          pages,
          (p) => measureFromRatio(preset.paper, preset.real, preset.unit, meta(p)?.userUnit ?? 1),
          opts,
        );
      },
      clearScale: (pages, opts) => change(pages, () => null, opts),
    } satisfies Partial<MeasurementCapability>,
  };
}
