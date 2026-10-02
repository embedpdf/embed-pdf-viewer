/**
 * The measurement plugin's readers: `useMeasurement()` (the API), `useMeasurementState()`,
 * `useMeasurementSettings()`, `useMeasurementEvent()`, and one per page scale and one per
 * measurement, so a template updates only for its own page or measurement. Every one works before
 * a document opens.
 */
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
import { documentScopeOf } from '../runtime/binding.svelte';
import {
  useCapability,
  useCapabilityEvent,
  useKernelValue,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';
import { valueOf, type CurrentValue, type MaybeGetter } from '../runtime/values.svelte';

/**
 * The measurement API (scales, calibration, readouts, creating measurements) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document every method throws
 * `not-ready`.
 */
export function useMeasurement(): MeasurementCapability {
  return useCapability(MeasurementToken);
}

/** Subscribe to one measurement event while the component lives: `useMeasurementEvent((measurement) => measurement.onScaleChanged, handler)`. */
export function useMeasurementEvent<T>(
  select: (measurement: MeasurementCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MeasurementToken, select, handler);
}

/**
 * The measurement state: whether a scale change runs, the calibration request waiting for its
 * length, and the last change's reports (the page's State table, declared once in
 * `measurementState`), as a reactive object (`state.calibrationRequest`). With a selector, the
 * value it picks as `{ current }`. Empty without a document.
 */
export const useMeasurementState = stateReader(measurementState);

/** The measurement settings (`defaultScale`, `presets`), with or without a document. */
export const useMeasurementSettings = settingsReader(MeasurementToken);

/**
 * A page's measurement scale (its ref or its index; a function to follow a prop) as
 * `{ current }`: for a scale bar or a "1:100" badge. Accepts `null` (no current page) and answers
 * `null` then, so chrome can stay mounted without inventing a page.
 */
export function usePageScale(page: MaybeGetter<PageRef | number>): CurrentValue<PageScale>;
export function usePageScale(
  page: MaybeGetter<PageRef | number | null>,
): CurrentValue<PageScale | null>;
export function usePageScale(
  page: MaybeGetter<PageRef | number | null>,
): CurrentValue<PageScale | null> {
  const scoped = documentScopeOf();
  // Scales are reference-stable in the plugin, so the value changes only when this page's does.
  return useKernelValue((kernel) => {
    const wanted = valueOf(page);
    if (wanted === null) return null;
    return (
      kernel.tryCapability(MeasurementToken, scoped() ?? undefined)?.getPageScale(wanted) ??
      NO_PAGE_SCALE
    );
  });
}

/**
 * A measurement's `{ kind, value, label }` as `{ current }`, or `{ unavailable }` with why there's
 * none. A measurement that changes is a function: `useMeasurementReadout(() => annotation)`.
 * Readouts are reference-stable in the plugin, so the value changes only when the measurement's
 * does.
 */
export function useMeasurementReadout(
  ref: MaybeGetter<AnnotationRef>,
): CurrentValue<MeasurementReadout | MeasurementUnavailable> {
  return useOptionalSelector(
    MeasurementToken,
    (measurement) => measurement.getReadout(valueOf(ref)),
    NO_READOUT as MeasurementReadout | MeasurementUnavailable,
  );
}
