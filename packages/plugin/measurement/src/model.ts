/**
 * The measurement session: scale changes in flight, the pending calibration,
 * the last change's reports, and the session-only viewports of engines that
 * cannot persist a scale. The pages' viewports themselves are on their
 * layouts. Every transition below is pure; the controller applies them with
 * `ctx.state.update`. `selectPageScale` is the pure projection from
 * viewports to the public {@link PageScale}.
 */
import { viewportForPoint } from '@embedpdf/engine-core/runtime';
import type { PageMeasurementViewport, PdfMeasure, PdfSize } from '@embedpdf/engine-core/runtime';

import type { CalibrationRequest, PageScale, ScaleChangeReport } from './contract';

export interface MeasurementModel {
  /** Scale changes in flight. */
  readonly pending: number;
  readonly calibration: CalibrationRequest | null;
  readonly reports: readonly ScaleChangeReport[];
  /** Page object number → the page's viewports, when the engine has no page measure service. */
  readonly localViewports: Readonly<Record<number, readonly PageMeasurementViewport[]>>;
}

/** No reports yet: the same array every time. */
export const NO_REPORTS: readonly ScaleChangeReport[] = Object.freeze([]);

export const initialMeasurementModel = (): MeasurementModel => ({
  pending: 0,
  calibration: null,
  reports: NO_REPORTS,
  localViewports: {},
});

export const beginScaleChange = (state: MeasurementModel): MeasurementModel => ({
  ...state,
  pending: state.pending + 1,
});

export const endScaleChange = (state: MeasurementModel): MeasurementModel =>
  state.pending === 0 ? state : { ...state, pending: state.pending - 1 };

export const setCalibration = (
  state: MeasurementModel,
  calibration: CalibrationRequest | null,
): MeasurementModel => (state.calibration === calibration ? state : { ...state, calibration });

export const setReports = (
  state: MeasurementModel,
  reports: readonly ScaleChangeReport[],
): MeasurementModel => (state.reports === reports ? state : { ...state, reports });

export const setLocalViewports = (
  state: MeasurementModel,
  pageObjectNumber: number,
  viewports: readonly PageMeasurementViewport[],
): MeasurementModel => ({
  ...state,
  localViewports: { ...state.localViewports, [pageObjectNumber]: viewports },
});

/**
 * The scale a page's viewports resolve to: the owned viewport, else the one
 * containing the page's center, else the fallback.
 */
export function selectPageScale(
  viewports: readonly PageMeasurementViewport[],
  size: PdfSize,
  fallback: PdfMeasure,
  persistent: boolean,
): PageScale {
  const selected =
    viewports.find((viewport) => viewport.owned) ??
    viewportForPoint(viewports, { x: size.width / 2, y: size.height / 2 });
  return {
    measure: selected ? (selected.measure ?? null) : fallback,
    source: selected ? (selected.owned ? 'owned' : 'foreign') : 'default',
    ready: true,
    persistent,
  };
}
