/** The measurement slice: per-page viewports and resolved scale, the busy
 *  counter, the pending calibration and the last change's reports. */
import type { PageMeasurementViewport, PageRef } from '@embedpdf/engine-core/runtime';

import type { CalibrationRequest, PageScale, ScaleChangeReport } from './contract';

export interface MeasurementState {
  pages: Record<number, { viewports: PageMeasurementViewport[]; scale: PageScale }>;
  pending: number;
  calibration: CalibrationRequest | null;
  reports: readonly ScaleChangeReport[];
}

export type MeasurementAction =
  | { type: 'PAGE_SCALE'; page: PageRef; viewports: PageMeasurementViewport[]; scale: PageScale }
  | { type: 'PENDING'; delta: number }
  | { type: 'CALIBRATION'; request: CalibrationRequest | null }
  | { type: 'REPORTS'; reports: readonly ScaleChangeReport[] };

export const initialMeasurementState = (): MeasurementState => ({
  pages: {},
  pending: 0,
  calibration: null,
  reports: [],
});

export function measurementReducer(s: MeasurementState, a: MeasurementAction): MeasurementState {
  switch (a.type) {
    case 'PAGE_SCALE':
      return {
        ...s,
        pages: {
          ...s.pages,
          [a.page.pageObjectNumber]: { viewports: a.viewports, scale: a.scale },
        },
      };
    case 'PENDING':
      return { ...s, pending: Math.max(0, s.pending + a.delta) };
    case 'CALIBRATION':
      return { ...s, calibration: a.request };
    case 'REPORTS':
      return { ...s, reports: a.reports };
    default:
      return s;
  }
}
