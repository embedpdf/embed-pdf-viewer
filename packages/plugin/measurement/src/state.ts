/**
 * The measurements page's State table as code: what `useMeasurementState()`
 * returns, and the same fields in every other framework. A page's scale and a
 * measurement's readout are not here: `usePageScale(page)` and
 * `useMeasurementReadout(ref)` read them, so a component re-renders only for
 * its own page or measurement.
 */
import { defineState } from '@embedpdf/core';

import { MeasurementToken } from './contract';
import { NO_REPORTS } from './model';

export const measurementState = defineState(MeasurementToken, {
  read: (measurement) => ({
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
