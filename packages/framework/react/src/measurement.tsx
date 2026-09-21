import type { PageRef } from '@embedpdf/core';
import { MeasurementToken } from '@embedpdf/plugin-measurement';
import type { MeasurementCapability, PageScale } from '@embedpdf/plugin-measurement';
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

/** The page's measurement scale, subscribed. Accepts `null` (no current
 *  page — an empty document, a lens between pages) and answers `null` then,
 *  so chrome can stay mounted without inventing a page address. */
export function usePageScale(page: PageRef): PageScale;
export function usePageScale(page: PageRef | null): PageScale | null;
export function usePageScale(page: PageRef | null): PageScale | null {
  return useSelector(MeasurementToken, (c) => (page ? c.getPageScale(page) : null));
}

export const useMeasurementReadout = (ref: AnnotationRef) =>
  useSelector(
    MeasurementToken,
    (c) => c.getReadout(ref),
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
