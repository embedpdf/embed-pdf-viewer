import { MeasurementToken } from '@embedpdf/plugin-measurement';
import type { MeasurementCapability } from '@embedpdf/plugin-measurement';
import type { AnnotationRef } from '@embedpdf/plugin-measurement';
import { useCapability, useSelector } from './runtime';

export * from '@embedpdf/plugin-measurement';

export function useMeasurement(): MeasurementCapability & {
  busy: boolean;
  canCalibratePage: boolean;
} {
  const cap = useCapability(MeasurementToken);
  const busy = useSelector(MeasurementToken, (c) => c.isBusy());
  const canCalibratePage = useSelector(MeasurementToken, (c) => c.canCalibrate());
  return { ...cap, busy, canCalibratePage };
}

export const usePageScale = (pon: number) => useSelector(MeasurementToken, (c) => c.pageScale(pon));

export const useMeasurementReadout = (ref: AnnotationRef) =>
  useSelector(
    MeasurementToken,
    (c) => c.readout(ref),
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
