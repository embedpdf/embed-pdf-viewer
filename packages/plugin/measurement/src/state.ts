/**
 * The measurements page's State table as code: what `useMeasurementState()`
 * returns, and the same fields in every other framework. A page's scale and a
 * measurement's readout are not here: `usePageScale(page)` and
 * `useMeasurementReadout(ref)` read them, so a component re-renders only for
 * its own page or measurement.
 */
import { defineState } from '@embedpdf/core';

import { MeasurementToken, type CalibrationRequest, type ScaleChangeReport } from './contract';
import { NO_REPORTS } from './model';

/** Whether a scale change runs, a calibration waiting for its length, and the last change's reports. */
export interface MeasurementState {
  /** A scale change is in flight. */
  readonly busy: boolean;
  /** Two points captured, awaiting a length, or `null`. */
  readonly calibrationRequest: CalibrationRequest | null;
  /** The reports of the last scale change, one per page. */
  readonly lastReports: readonly ScaleChangeReport[];
}

export const measurementState = defineState(MeasurementToken, {
  read: (measurement): MeasurementState => ({
    busy: measurement.isBusy(),
    calibrationRequest: measurement.getCalibrationRequest(),
    lastReports: measurement.listLastReports(),
  }),
  empty: {
    busy: false,
    calibrationRequest: null,
    lastReports: NO_REPORTS,
  },
});
