/**
 * @embedpdf/vue/measurement: the Vue view of `@embedpdf/plugin-measurement`.
 * The four composables every plugin has, plus one per page scale and one per
 * measurement, so a template updates only for its own page or measurement.
 * Every one works before a document opens.
 *
 *   const measurement = useMeasurement();
 *   const scale = usePageScale(0); // the cover's, as a ref
 *   const readout = useMeasurementReadout(() => props.annotation); // { kind, value, label }
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-measurement';
import { toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
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
import { useCapability, useCapabilityEvent, useOptionalSelector } from './runtime/capabilities';
import { useDocumentScope, useKernelValue } from './runtime/kernel';
import { settingsComposable, stateComposable } from './state';

/**
 * The measurement API (scales, calibration, readouts, creating measurements)
 * of the nearest `<DocumentScope>`'s document, else the active one. The object
 * never changes; outside a document every method throws `not-ready`.
 */
export function useMeasurement(): MeasurementCapability {
  return useCapability(MeasurementToken);
}

/** Subscribe to one measurement event while the component lives: `useMeasurementEvent((measurement) => measurement.onScaleChanged, handler)`. */
export function useMeasurementEvent<Event>(
  select: (measurement: MeasurementCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(MeasurementToken, select, handler);
}

/**
 * The measurement state as refs: whether a scale change runs, the
 * calibration request waiting for its length, and the last change's reports
 * (the page's State table, declared once in `measurementState`). With a
 * selector, one ref that updates only when the value it picks changes.
 */
export const useMeasurementState = stateComposable(measurementState);

/** The measurement settings (`defaultScale`, `presets`), with or without a document, as refs. Takes a selector. */
export const useMeasurementSettings = settingsComposable(MeasurementToken);

/**
 * A page's measurement scale (its ref or its index; a getter to follow a
 * prop), as a ref: for a scale bar or a "1:100" badge. Accepts `null` (no
 * current page) and answers `null` then, so chrome can stay mounted without
 * inventing a page.
 */
export function usePageScale(page: MaybeRefOrGetter<PageRef | number>): Readonly<Ref<PageScale>>;
export function usePageScale(
  page: MaybeRefOrGetter<PageRef | number | null>,
): Readonly<Ref<PageScale | null>>;
export function usePageScale(
  page: MaybeRefOrGetter<PageRef | number | null>,
): Readonly<Ref<PageScale | null>> {
  const scope = useDocumentScope();
  // Scales are reference-stable in the plugin, so the ref updates only when this page's changes.
  return useKernelValue((kernel) => {
    const wanted = toValue(page);
    if (wanted === null) return null;
    return (
      kernel.tryCapability(MeasurementToken, scope.value ?? undefined)?.getPageScale(wanted) ??
      NO_PAGE_SCALE
    );
  });
}

/**
 * A measurement's `{ kind, value, label }` as a ref, or `{ unavailable }`
 * with why there's none. Pass a getter to follow a prop:
 * `useMeasurementReadout(() => props.annotation)`. Readouts are
 * reference-stable in the plugin, so the ref updates only when the
 * measurement's changes.
 */
export function useMeasurementReadout(
  ref: MaybeRefOrGetter<AnnotationRef>,
): Readonly<Ref<MeasurementReadout | MeasurementUnavailable>> {
  return useOptionalSelector(
    MeasurementToken,
    (measurement) => measurement.getReadout(toValue(ref)),
    NO_READOUT as MeasurementReadout | MeasurementUnavailable,
  );
}
