import { useMeasurement, useMeasurementState } from '@embedpdf/react/measurement';

import { LengthPrompt } from './length-prompt';

export function CalibrationDialog() {
  const measurement = useMeasurement();
  const { calibrationRequest } = useMeasurementState();
  if (!calibrationRequest) return null;

  const apply = (value: number) =>
    measurement.calibrate({ ...calibrationRequest, distance: { value, unit: 'cm' } });

  return <LengthPrompt onSubmit={apply} onCancel={() => measurement.dismissCalibration()} />;
}
