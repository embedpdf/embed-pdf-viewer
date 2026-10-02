/**
 * The React view of @embedpdf/plugin-measurement: the four hooks every
 * plugin has, plus one per page scale and one per measurement, so a
 * component re-renders only for its own page or measurement. Every hook
 * works before a document opens.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-measurement';
import type { EventHook, PageRef } from '@embedpdf/core';
import {
  MeasurementToken,
  measurementState,
  NO_PAGE_SCALE,
  NO_READOUT,
} from '@embedpdf/plugin-measurement';
import type {
  AnnotationRef,
  MeasurementCapability,
  MeasurementReadout,
  MeasurementUnavailable,
  PageScale,
} from '@embedpdf/plugin-measurement';
import { useCapability, useCapabilityEvent, useDocumentScope, useKernelValue } from './runtime';
import { settingsHook, stateHook } from './state';

/** The measurement capability: scales, calibration, readouts and creating measurements. */
export function useMeasurement(): MeasurementCapability {
  return useCapability(MeasurementToken);
}

/** Subscribe to one measurement event for the mounted lifetime: `useMeasurementEvent((measurement) => measurement.onScaleChanged, handler)`. */
export function useMeasurementEvent<T>(
  select: (measurement: MeasurementCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MeasurementToken, select, handler);
}

/**
 * The measurement state: whether a scale change runs, the calibration
 * request waiting for its length, and the last change's reports (the page's
 * State table, declared once in `measurementState`). Takes a selector, and
 * re-renders only when what it returns changes.
 */
export const useMeasurementState = stateHook(measurementState);

/** The measurement settings (`defaultScale`, `presets`), with or without a document. Takes a selector. */
export const useMeasurementSettings = settingsHook(MeasurementToken);

/**
 * A page's measurement scale (its ref or its index), for a scale bar or a
 * "1:100" badge. Accepts `null` (no current page) and answers `null` then,
 * so chrome can stay mounted without inventing a page.
 */
export function usePageScale(page: PageRef | number): PageScale;
export function usePageScale(page: PageRef | number | null): PageScale | null;
export function usePageScale(page: PageRef | number | null): PageScale | null {
  const scoped = useDocumentScope();
  // Scales are reference-stable in the plugin, so this re-renders only when this page's changes.
  return useKernelValue((kernel) => {
    if (page === null) return null;
    return (
      kernel.tryCapability(MeasurementToken, scoped ?? undefined)?.getPageScale(page) ??
      NO_PAGE_SCALE
    );
  });
}

/**
 * A measurement's `{ kind, value, label }`, or `{ unavailable }` with why there's none.
 * Readouts are reference-stable in the plugin, so this re-renders only when the measurement's
 * changes.
 */
export function useMeasurementReadout(
  ref: AnnotationRef,
): MeasurementReadout | MeasurementUnavailable {
  const scoped = useDocumentScope();
  return useKernelValue(
    (kernel) =>
      kernel.tryCapability(MeasurementToken, scoped ?? undefined)?.getReadout(ref) ?? NO_READOUT,
  );
}
