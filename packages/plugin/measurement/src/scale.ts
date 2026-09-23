/** Scale arithmetic: the default presets and scale, and unit and precision edits of a scale. */
import {
  areaUnitLabel,
  measureFromRatio,
  METRES,
  squareMetres,
  squareOf,
} from '@embedpdf/engine-core/runtime';
import type { AreaUnit, LengthUnit, PdfMeasure } from '@embedpdf/engine-core/runtime';

import type { MeasurementConfig, ScalePreset } from './contract';

export const DEFAULT_PRESETS: ScalePreset[] = [
  ...[1, 10, 20, 50, 100, 200].map((real) => ({
    id: `metric-${real}`,
    label: `1:${real}`,
    paper: 1,
    real,
    unit: 'm' as const,
  })),
  { id: 'imperial-quarter', label: '1/4 in = 1 ft', paper: 1, real: 48, unit: 'ft' },
  { id: 'imperial-eighth', label: '1/8 in = 1 ft', paper: 1, real: 96, unit: 'ft' },
];

export const defaultMeasure = (config: MeasurementConfig, userUnit = 1): PdfMeasure =>
  typeof config.defaultScale === 'object'
    ? config.defaultScale
    : measureFromRatio(1, 1, config.defaultScale === 'imperial' ? 'ft' : 'm', userUnit);

export function withUnit(
  measure: PdfMeasure,
  unit: LengthUnit,
  area: AreaUnit = squareOf(unit),
): PdfMeasure {
  const basis = measure.x[0]?.unit.trim() as LengthUnit;
  if (!(basis in METRES)) {
    throw new RangeError('This scale has an unknown base unit; calibrate it first');
  }
  const previous = measure.distance[measure.distance.length - 1];
  const precision = previous?.fraction === 'fraction' ? 100 : (previous?.precision ?? 100);
  return {
    ...measure,
    distance: [{ unit, conversion: METRES[basis] / METRES[unit], precision, fraction: 'decimal' }],
    area: [
      {
        unit: areaUnitLabel(area),
        conversion: METRES[basis] ** 2 / squareMetres(area),
        precision,
        fraction: 'decimal',
      },
    ],
  };
}

export function withPrecision(measure: PdfMeasure, precision: number): PdfMeasure {
  if (!Number.isInteger(Math.log10(precision)) || precision < 1 || precision > 1e9) {
    throw new RangeError('Invalid decimal precision');
  }
  const update = (formats: PdfMeasure['distance']) =>
    formats.map((format, index) =>
      index === formats.length - 1
        ? { ...format, precision, fraction: 'decimal' as const }
        : format,
    );
  return { ...measure, distance: update(measure.distance), area: update(measure.area) };
}

/** Change the area display unit while preserving imported distance formatting. */
export function withAreaUnit(measure: PdfMeasure, unit: AreaUnit): PdfMeasure {
  const basis = measure.x[0]?.unit.trim() as LengthUnit;
  if (!(basis in METRES)) {
    throw new RangeError('This scale has an unknown base unit; calibrate it first');
  }
  const previous = measure.area[measure.area.length - 1];
  const precision = previous?.fraction === 'fraction' ? 100 : (previous?.precision ?? 100);
  return {
    ...measure,
    area: [
      {
        unit: areaUnitLabel(unit),
        conversion: METRES[basis] ** 2 / squareMetres(unit),
        precision,
        fraction: 'decimal',
      },
    ],
  };
}
