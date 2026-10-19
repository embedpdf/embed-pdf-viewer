/** Reads: the page scale, the vocabulary, readouts, and pure conversions in the page's scale. */
import type { Point } from '@embedpdf/core-geometry';
import { measurementReadout, METRES, squareOf } from '@embedpdf/engine-core/runtime';
import type {
  Annotation,
  AnnotationRef,
  AreaUnit,
  MeasurementReadout,
  MeasurementUnavailable,
  PageRef,
} from '@embedpdf/engine-core/runtime';

import { NO_READOUT, type MeasurementCapability } from '../contract';
import type { MeasurementContext, MeasurementServices } from '../services';
import type { MeasurementViewportSync } from '../sync/viewports';

const UNITS = Object.keys(METRES) as Array<keyof typeof METRES>;
const AREA_UNITS: readonly AreaUnit[] = [...UNITS.map(squareOf), 'ha', 'acre'];

export function createScaleReads(
  ctx: MeasurementContext,
  { siblings }: Pick<MeasurementServices, 'siblings'>,
  { scaleOf }: Pick<MeasurementViewportSync, 'scaleOf'>,
) {
  const { annotation } = siblings;
  const settings = ctx.settings();
  const state = () => ctx.state.get();

  // One readout per annotation object: the annotation plugin hands out the same
  // object until the annotation changes, so the readout stays the same with it.
  const readouts = new WeakMap<Annotation, MeasurementReadout | MeasurementUnavailable>();
  const getReadout = (ref: AnnotationRef): MeasurementReadout | MeasurementUnavailable => {
    const raw = annotation.get(ref);
    if (!raw) return NO_READOUT;
    let readout = readouts.get(raw);
    if (!readout) {
      readout = measurementReadout(raw);
      readouts.set(raw, readout);
    }
    return readout;
  };
  const measureDistance = (
    page: PageRef | number,
    from: Point,
    to: Point,
  ): MeasurementReadout | MeasurementUnavailable =>
    measurementReadout({
      subtype: 'line',
      intent: 'line-dimension',
      measure: scaleOf(page).measure,
      linePoints: { start: from, end: to },
    });
  const measureArea = (
    page: PageRef | number,
    vertices: readonly Point[],
  ): MeasurementReadout | MeasurementUnavailable =>
    measurementReadout({
      subtype: 'polygon',
      intent: 'polygon-dimension',
      measure: scaleOf(page).measure,
      vertices: [...vertices],
    });

  return {
    api: {
      canMeasure: (page) => ctx.allows('annotations:create') && scaleOf(page).ready,
      getPageScale: scaleOf,
      isBusy: () => state().pending > 0,
      listLastReports: () => state().reports,
      listPresets: () => settings.get().presets,
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
