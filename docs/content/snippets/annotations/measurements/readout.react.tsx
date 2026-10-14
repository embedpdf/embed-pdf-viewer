import type { AnnotationRef } from '@embedpdf/react/annotation';
import { useMeasurementReadout } from '@embedpdf/react/measurement';

export function MeasurementLabel({ annotation }: { annotation: AnnotationRef }) {
  const readout = useMeasurementReadout(annotation);
  // { kind: 'distance', value: 3.42, label: '3.42 m' }

  return <span>{'unavailable' in readout ? '—' : readout.label}</span>;
}
