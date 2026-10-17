import { useState } from 'react';
import { useMeasurementEvent } from '@embedpdf/react/measurement';

export function ScaleNotice() {
  const [message, setMessage] = useState('');

  useMeasurementEvent(
    (measurement) => measurement.onScaleChanged,
    () => setMessage('The scale changed'),
  );

  return <p aria-live="polite">{message}</p>;
}
