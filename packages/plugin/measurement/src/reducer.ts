import type { MeasurementAction, MeasurementState } from './types';

export const initialMeasurementState: MeasurementState = {
  pages: {},
  pending: 0,
  calibration: null,
  reports: [],
};

export function measurementReducer(s: MeasurementState, a: MeasurementAction): MeasurementState {
  switch (a.type) {
    case 'PAGE_SCALE':
      return { ...s, pages: { ...s.pages, [a.pon]: { viewports: a.viewports, scale: a.scale } } };
    case 'PENDING':
      return { ...s, pending: Math.max(0, s.pending + a.delta) };
    case 'CALIBRATION':
      return { ...s, calibration: a.request };
    case 'REPORTS':
      return { ...s, reports: a.reports };
  }
}
