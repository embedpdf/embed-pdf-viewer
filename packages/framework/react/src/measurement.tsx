import type { PageRef } from '@embedpdf/core';
import { MeasurementToken } from '@embedpdf/plugin-measurement';
import type { MeasurementCapability, PageScale } from '@embedpdf/plugin-measurement';
import type { AnnotationRef } from '@embedpdf/plugin-measurement';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useSelector } from './runtime';

export * from '@embedpdf/plugin-measurement';

/** Subscribe to one measurement event for the mounted lifetime: `useMeasurementEvent((measurement) => measurement.onScaleChanged, handler)`. */
export function useMeasurementEvent<T>(
  select: (measurement: MeasurementCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MeasurementToken, select, handler);
}

/** The calibration the plugin is asking the chrome to complete, if any. */
export function useCalibrationRequest() {
  return useSelector(MeasurementToken, (measurement) => measurement.getCalibrationRequest());
}

/**
 * The measurement capability plus `busy`, subscribed: true while a scale
 * change runs. Read permissions with a selector, like every other plugin:
 * `useSelector(MeasurementToken, (measurement) => measurement.canCalibrate())`.
 */
export function useMeasurement(): MeasurementCapability & { busy: boolean } {
  const measurement = useCapability(MeasurementToken);
  const busy = useSelector(MeasurementToken, (current) => current.isBusy());
  return { ...measurement, busy };
}

/** The page's measurement scale, subscribed. Accepts `null` (no current
 *  page — an empty document, a lens between pages) and answers `null` then,
 *  so chrome can stay mounted without inventing a page address. */
export function usePageScale(page: PageRef): PageScale;
export function usePageScale(page: PageRef | null): PageScale | null;
export function usePageScale(page: PageRef | null): PageScale | null {
  return useSelector(MeasurementToken, (measurement) =>
    page ? measurement.getPageScale(page) : null,
  );
}

export const useMeasurementReadout = (ref: AnnotationRef) =>
  useSelector(
    MeasurementToken,
    (measurement) => measurement.getReadout(ref),
    (left, right) => JSON.stringify(left) === JSON.stringify(right),
  );
