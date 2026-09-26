/** Reads: the page scale, the vocabulary, readouts, and pure conversions in the page's scale. */
import type { Point } from '@embedpdf/core-geometry';
import { measurementReadout, METRES, squareOf } from '@embedpdf/engine-core/runtime';
import type {
  AnnotationRef,
  AreaUnit,
  MeasurementReadout,
  MeasurementUnavailable,
  PageRef,
} from '@embedpdf/engine-core/runtime';

import type { MeasurementCapability, MeasurementConfig } from '../contract';
import { DEFAULT_PRESETS } from '../scale';
import type { MeasurementContext, MeasurementServices } from '../services';
import type { MeasurementViewportSync } from '../sync/viewports';

const UNITS = Object.keys(METRES) as Array<keyof typeof METRES>;
const AREA_UNITS: readonly AreaUnit[] = [...UNITS.map(squareOf), 'ha', 'acre'];

export function createScaleReads(
  ctx: MeasurementContext,
  { store, siblings }: Pick<MeasurementServices, 'store' | 'siblings'>,
  config: MeasurementConfig,
  { scaleOf }: Pick<MeasurementViewportSync, 'scaleOf'>,
) {
  const { toPdf } = store;
  const { annotation } = siblings;
  const presets = config.presets ?? DEFAULT_PRESETS;
  const state = () => ctx.state.get();

  const getReadout = (ref: AnnotationRef): MeasurementReadout | MeasurementUnavailable => {
    const raw = annotation.getRaw(ref);
    return raw ? measurementReadout(raw) : { unavailable: 'not-dimension' };
  };
  const measureDistance = (
    page: PageRef,
    from: Point,
    to: Point,
  ): MeasurementReadout | MeasurementUnavailable =>
    measurementReadout({
      subtype: 'line',
      intent: 'line-dimension',
      measure: scaleOf(page).measure,
      linePoints: { start: toPdf(page, from), end: toPdf(page, to) },
    });
  const measureArea = (
    page: PageRef,
    vertices: readonly Point[],
  ): MeasurementReadout | MeasurementUnavailable =>
    measurementReadout({
      subtype: 'polygon',
      intent: 'polygon-dimension',
      measure: scaleOf(page).measure,
      vertices: vertices.map((vertex) => toPdf(page, vertex)),
    });

  return {
    presets,
    api: {
      canMeasure: (page) => annotation.canCreate() && scaleOf(page).ready,
      getPageScale: scaleOf,
      isBusy: () => state().pending > 0,
      listLastReports: () => state().reports,
      listPresets: () => presets,
      listUnits: () => UNITS,
      listAreaUnits: () => AREA_UNITS,
      getReadout,
      measureDistance,
      measureArea,
      getCalibrationRequest: () => state().calibration,
    } satisfies Partial<MeasurementCapability>,
  };
}
export type MeasurementScaleReads = ReturnType<typeof createScaleReads>;
