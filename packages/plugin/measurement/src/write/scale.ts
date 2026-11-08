/**
 * Scale writes. A scale change is one change of the document: the pages'
 * `pages.setScale` ops and, unless told not to, the re-measure of the
 * measurements on them, staged in one group, so it is one request and one
 * undo step. A multi-page change reports per page; a single-page change
 * rejects.
 */
import { PluginError, toPluginError } from '@embedpdf/core';
import {
  assertWritableMeasure,
  measureFromKnownLength,
  measureFromRatio,
  measurementPoint,
  pageRefsEqual,
  scaleBackOf,
  serializeError,
  viewportsWithScale,
} from '@embedpdf/engine-core/runtime';
import type { ChangeOp, PageRef, PdfMeasure } from '@embedpdf/engine-core/runtime';

import type {
  CalibrateInput,
  MeasurementCapability,
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
import { defaultMeasure, withAreaUnit, withPrecision, withUnit } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';
import { SCALE_PERMISSION } from '../services/store';
import type { MeasurementViewportSync } from '../sync/viewports';

/** A page and the scale a change gives it (`null`: back to the default). */
interface PageScaleWrite {
  readonly page: PageRef;
  readonly scale: PdfMeasure | null;
}

export function createScaleWrites(
  ctx: MeasurementContext,
  { events, store, siblings }: Pick<MeasurementServices, 'events' | 'store' | 'siblings'>,
  { scaleOf, isPersistent }: Pick<MeasurementViewportSync, 'scaleOf' | 'isPersistent'>,
) {
  const { scaleChanged, calibrationCompleted } = events;
  const { requirePage, targets } = store;
  const { annotation } = siblings;
  const settings = ctx.settings();

  /** The scale a page measures in once it has `scale`: the default where `null` removes it. */
  const effectiveScale = (page: PageRef, scale: PdfMeasure | null): PdfMeasure =>
    scale ?? defaultMeasure(settings.get().defaultScale, requirePage(page).userUnit);

  /** A session-only scale: the engine can't keep one, so the session's state holds it. */
  const writeLocal = ({ page, scale }: PageScaleWrite): void => {
    const layout = requirePage(page);
    const viewports = ctx.state.get().localViewports[page.objectNumber] ?? [];
    ctx.state.update(
      setLocalViewports,
      page.objectNumber,
      viewportsWithScale(viewports, layout.size, scale),
    );
  };

  /** One `pages.setScale` op per scale: the pages that get the same one go together. */
  const opsOf = (writes: readonly PageScaleWrite[]): ChangeOp[] => {
    const groups = new Map<string, { measure: PdfMeasure | null; pages: PageRef[] }>();
    for (const { page, scale } of writes) {
      const key = JSON.stringify(scale);
      const group = groups.get(key) ?? { measure: scale, pages: [] };
      group.pages.push(page);
      groups.set(key, group);
    }
    return [...groups.values()].map(({ measure, pages }) => ({
      type: 'pages.setScale',
      pages,
      measure,
    }));
  };

  /**
   * The pages' scales and the re-measure of their measurements, staged in one
   * group: one change, which the engine applies all or none of.
   */
  const write = async (
    writes: readonly PageScaleWrite[],
    recalculate: boolean,
    signal: AbortSignal | undefined,
  ): Promise<ScaleChangeReport[]> => {
    const kept = writes.filter(({ page }) => isPersistent(page));
    writes.filter(({ page }) => !isPersistent(page)).forEach(writeLocal);
    const label = { key: 'measurement.setScale', count: writes.length };
    const staged = ctx.changes.group(label, () => ({
      change:
        kept.length > 0
          ? ctx.changes.stage({
              label,
              ops: opsOf(kept),
              undo: scaleBackOf(
                ctx.document()?.pages ?? [],
                kept.map(({ page }) => page),
              ),
            })
          : null,
      reports: writes.map(({ page, scale }): ScaleChangeReport => {
        const effective = effectiveScale(page, scale);
        return recalculate
          ? annotation.stageRemeasure(page, effective)
          : { page, scale: effective, updated: [], skipped: [], failed: [] };
      }),
    }));
    // Without a scale to write, the group may still hold the re-measure: wait for all of it.
    if (staged.change) await ctx.cancellable(signal, staged.change.result);
    else await ctx.cancellable(signal, ctx.changes.whenSettled());
    return staged.reports;
  };

  /** What a page that didn't get its scale reports: why. */
  const refusedReport = (page: PageRef, error: unknown): ScaleChangeReport => ({
    page,
    updated: [],
    skipped: [],
    failed: [],
    scaleError: serializeError(error),
  });

  const change = async (
    pages: PageTarget,
    measure: (page: PageRef) => PdfMeasure | null,
    options: ScaleChangeOptions = {},
  ): Promise<readonly ScaleChangeReport[]> => {
    ctx.assertAllowed(SCALE_PERMISSION, 'changing a scale');
    // Every page is resolved first: a page that isn't there refuses the call.
    const target = targets(pages);
    const { signal } = options;
    if (signal?.aborted) {
      throw new PluginError('operation-cancelled', 'measurement', 'operation cancelled', {
        cause: signal.reason,
      });
    }
    // One page: a failure rejects. Several: each page reports its own outcome.
    const tolerant = pages === 'all' || target.length > 1;
    const recalculate = options.recalculate !== false;
    ctx.state.update(beginScaleChange);
    try {
      // Re-measuring takes every measurement on the pages.
      if (recalculate) await ctx.cancellable(signal, annotation.whenRemeasurable());
      ctx.assertAllowed(SCALE_PERMISSION, 'changing a scale');
      const reports = new Map<number, ScaleChangeReport>();
      const writes: PageScaleWrite[] = [];
      for (const page of target) {
        try {
          const scale = measure(page);
          if (scale) assertWritableMeasure(scale);
          writes.push({ page, scale });
        } catch (error) {
          const refused = toPluginError('measurement', error);
          if (!tolerant) throw refused;
          reports.set(page.objectNumber, refusedReport(page, refused));
        }
      }
      if (writes.length > 0) {
        try {
          for (const report of await write(writes, recalculate, signal)) {
            reports.set(report.page.objectNumber, report);
          }
        } catch (error) {
          const refused = toPluginError('measurement', error);
          // A cancel ends the whole change; a refusal fails every page of it.
          if (!tolerant || refused.code === 'operation-cancelled') throw refused;
          for (const { page } of writes)
            reports.set(page.objectNumber, refusedReport(page, refused));
        }
      }
      const ordered = target.map((page) => reports.get(page.objectNumber)!);
      for (const report of ordered) {
        if (!report.scaleError) scaleChanged.emit({ page: report.page, report });
      }
      ctx.state.update(setReports, ordered);
      return ordered;
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
    const start = measurementPoint(input.from);
    const end = measurementPoint(input.to);
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
    const page = requirePage(input.page).ref;
    const reports = await change(applyTo ?? page, () => scale, rest);
    const request = ctx.state.get().calibration;
    if (request && pageRefsEqual(request.page, page)) {
      ctx.state.update(setCalibration, null);
    }
    calibrationCompleted.emit({ page });
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
        const preset = settings.get().presets.find((candidate) => candidate.id === presetId);
        if (!preset) {
          return Promise.reject(
            new PluginError('not-found', 'measurement', `unknown scale preset '${presetId}'`),
          );
        }
        return change(
          pages,
          (page) =>
            measureFromRatio(preset.paper, preset.real, preset.unit, {
              userUnit: ctx.getPage(page)?.userUnit ?? 1,
            }),
          options,
        );
      },
      clearScale: (pages, options) => change(pages, () => null, options),
    } satisfies Partial<MeasurementCapability>,
  };
}
