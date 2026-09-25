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
import {
  beginScaleChange,
  endScaleChange,
  setCalibration,
  setLocalViewports,
  setReports,
} from '../model';
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
    ensureLoaded,
    refresh,
    scaleOf,
  }: Pick<MeasurementViewportSync, 'ensureLoaded' | 'refresh' | 'scaleOf'>,
) {
  const { scaleChanged, calibrationCompleted } = events;
  const { requirePage, assertAllowed, targets, toPdf } = store;
  const { annotation } = siblings;

  /** Write one page's scale (`null` = back to the default) and re-measure. */
  const save = async (
    page: PageRef,
    scale: PdfMeasure | null,
    options: ScaleChangeOptions,
  ): Promise<ScaleChangeReport> => {
    assertAllowed();
    await ensureLoaded(page);
    assertAllowed();
    const service = ctx.doc.page(page).measure;
    if (service) {
      await service.setScale(scale);
      // The engine published `page.viewportsChanged` before resolving, so the
      // mirror is already re-reading this page: join that read, never start another.
      await ensureLoaded(page);
    } else {
      // A session-only scale: no engine event announces it, so re-read the page.
      const layout = requirePage(page);
      const kept = (ctx.state.get().localViewports[page.pageObjectNumber] ?? []).filter(
        (viewport) => !viewport.owned,
      );
      ctx.state.update(setLocalViewports, page.pageObjectNumber, [
        ...kept,
        ...(scale
          ? [{ bbox: layout.boxes.crop, name: 'EmbedPDF', owned: true, measure: scale }]
          : []),
      ]);
      await refresh(page);
    }
    const effective = scale ?? defaultMeasure(config, requirePage(page).userUnit);
    const report =
      options.recalculate === false
        ? { page, scale: effective, updated: [], skipped: [], failed: [] }
        : await annotation.remeasurePage(page, effective);
    scaleChanged.emit({ page, report });
    return report;
  };

  const change = async (
    pages: PageTarget,
    measure: (page: PageRef) => PdfMeasure | null,
    options: ScaleChangeOptions = {},
  ): Promise<readonly ScaleChangeReport[]> => {
    assertAllowed();
    const target = targets(pages);
    // One page: a failure rejects. Several: each page reports its own outcome.
    const tolerant = pages === 'all' || target.length > 1;
    ctx.state.update(beginScaleChange);
    try {
      const reports = await Promise.all(
        target.map((page) =>
          ctx.serialQueue(`scale:${page.pageObjectNumber}`)(
            async (): Promise<ScaleChangeReport> => {
              try {
                await ensureLoaded(page);
                const scale = measure(page);
                if (scale) assertWritableMeasure(scale);
                return await save(page, scale, options);
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
            },
          ),
        ),
      );
      ctx.state.update(setReports, reports);
      return reports;
    } finally {
      ctx.state.update(endScaleChange);
    }
  };

  /** The page's current rectilinear scale, for unit and precision edits. */
  const rectilinearOf = (page: PageRef): PdfMeasure => {
    const scale = scaleOf(page).measure;
    if (!scale || scale.subtype !== 'rectilinear') {
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
    options: ScaleChangeOptions & { applyTo?: PageTarget } = {},
  ): Promise<readonly ScaleChangeReport[]> => {
    const start = measurementPoint(toPdf(input.page, input.from));
    const end = measurementPoint(toPdf(input.page, input.to));
    let scale: PdfMeasure;
    try {
      scale = measureFromKnownLength(Math.hypot(end.x - start.x, end.y - start.y), input.distance);
    } catch (error) {
      throw new PluginError(
        'invalid-input',
        'measurement',
        String((error as Error).message ?? error),
      );
    }
    const { applyTo, ...rest } = options;
    const reports = await change(applyTo ?? input.page, () => scale, rest);
    const request = ctx.state.get().calibration;
    if (request && pageRefsEqual(request.page, input.page)) {
      ctx.state.update(setCalibration, null);
    }
    calibrationCompleted.emit({ page: input.page });
    return reports;
  };

  return {
    api: {
      setScale: (pages, measure, options) => change(pages, () => measure, options),
      calibrate,
      setUnit: (pages, unit, options) =>
        change(pages, (page) => withUnit(rectilinearOf(page), unit), options),
      setAreaUnit: (pages, unit, options) =>
        change(pages, (page) => withAreaUnit(rectilinearOf(page), unit), options),
      setPrecision: (pages, precision, options) =>
        change(pages, (page) => withPrecision(rectilinearOf(page), precision), options),
      setPreset: (pages, presetId, options) => {
        const preset = presets.find((candidate) => candidate.id === presetId);
        if (!preset) {
          return Promise.reject(
            new PluginError('not-found', 'measurement', `unknown scale preset '${presetId}'`),
          );
        }
        return change(
          pages,
          (page) =>
            measureFromRatio(
              preset.paper,
              preset.real,
              preset.unit,
              ctx.getPage(page)?.userUnit ?? 1,
            ),
          options,
        );
      },
      clearScale: (pages, options) => change(pages, () => null, options),
    } satisfies Partial<MeasurementCapability>,
  };
}
