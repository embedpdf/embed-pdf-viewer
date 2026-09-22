/**
 * The measurement session: scale changes in flight, the pending calibration,
 * the last change's reports, why a page's viewport read failed, and the
 * session-only viewports of engines that cannot persist a scale. The pages'
 * viewports themselves are engine data held by a page mirror. Every
 * transition below is pure; the controller applies them with
 * `ctx.state.update`. `selectPageScale` and `pageScaleOf` are the pure
 * projections from viewports to the public {@link PageScale}.
 */
import { viewportForPoint } from '@embedpdf/engine-core/runtime';
import type {
  PageMeasurementViewport,
  PdfMeasure,
  PdfRect,
  SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import type { ResourceStatus } from '@embedpdf/core';

import type { CalibrationRequest, PageScale, ScaleChangeReport } from './contract';

export interface MeasurementState {
  /** Scale changes in flight. */
  readonly pending: number;
  readonly calibration: CalibrationRequest | null;
  readonly reports: readonly ScaleChangeReport[];
  /** Page object number → why the last read of the page's viewports failed. */
  readonly loadErrors: Readonly<Record<number, SerializedEngineError>>;
  /** Page object number → the page's viewports, when the engine has no page measure service. */
  readonly localViewports: Readonly<Record<number, readonly PageMeasurementViewport[]>>;
}

export const initialMeasurementState = (): MeasurementState => ({
  pending: 0,
  calibration: null,
  reports: [],
  loadErrors: {},
  localViewports: {},
});

export const beginScaleChange = (state: MeasurementState): MeasurementState => ({
  ...state,
  pending: state.pending + 1,
});

export const endScaleChange = (state: MeasurementState): MeasurementState =>
  state.pending === 0 ? state : { ...state, pending: state.pending - 1 };

export const setCalibration = (
  state: MeasurementState,
  calibration: CalibrationRequest | null,
): MeasurementState => (state.calibration === calibration ? state : { ...state, calibration });

export const setReports = (
  state: MeasurementState,
  reports: readonly ScaleChangeReport[],
): MeasurementState => (state.reports === reports ? state : { ...state, reports });

export const recordLoadError = (
  state: MeasurementState,
  pageObjectNumber: number,
  error: SerializedEngineError,
): MeasurementState => ({
  ...state,
  loadErrors: { ...state.loadErrors, [pageObjectNumber]: error },
});

export const clearLoadError = (
  state: MeasurementState,
  pageObjectNumber: number,
): MeasurementState => {
  if (!(pageObjectNumber in state.loadErrors)) return state;
  const { [pageObjectNumber]: _cleared, ...loadErrors } = state.loadErrors;
  return { ...state, loadErrors };
};

export const setLocalViewports = (
  state: MeasurementState,
  pageObjectNumber: number,
  viewports: readonly PageMeasurementViewport[],
): MeasurementState => ({
  ...state,
  localViewports: { ...state.localViewports, [pageObjectNumber]: viewports },
});

/**
 * The scale a page's viewports resolve to: the owned viewport, else the one
 * containing the crop box's center, else the fallback.
 */
export function selectPageScale(
  viewports: readonly PageMeasurementViewport[],
  crop: PdfRect,
  fallback: PdfMeasure,
  persistent: boolean,
): PageScale {
  const selected =
    viewports.find((viewport) => viewport.owned) ??
    viewportForPoint(viewports, {
      x: (crop.left + crop.right) / 2,
      y: (crop.top + crop.bottom) / 2,
    });
  return {
    measure: selected ? (selected.measure ?? null) : fallback,
    source: selected ? (selected.owned ? 'owned' : 'foreign') : 'default',
    ready: true,
    persistent,
  };
}

/** What `pageScaleOf` projects: the page's mirrored viewports and read state, and its layout. */
export interface PageScaleInputs {
  /** The last confirmed viewports; undefined until the first read lands. */
  readonly viewports: readonly PageMeasurementViewport[] | undefined;
  readonly status: ResourceStatus;
  readonly error: SerializedEngineError | undefined;
  /** The page's crop box; undefined when the page is not in the registry. */
  readonly crop: PdfRect | undefined;
  readonly fallback: PdfMeasure;
  readonly persistent: boolean;
}

/**
 * The public page scale. A page is ready once its viewports were read; a
 * failed re-read keeps the last confirmed viewports in effect and reports
 * its error alongside them.
 */
export function pageScaleOf(inputs: PageScaleInputs): PageScale {
  const error = inputs.status === 'error' && inputs.error ? { error: inputs.error } : {};
  if (!inputs.viewports || !inputs.crop) {
    return {
      measure: null,
      source: 'default',
      ready: false,
      persistent: inputs.persistent,
      ...error,
    };
  }
  return {
    ...selectPageScale(inputs.viewports, inputs.crop, inputs.fallback, inputs.persistent),
    ...error,
  };
}
