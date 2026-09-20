import {
  areaUnitLabel,
  measureFromRatio,
  METRES,
  squareMetres,
  squareOf,
  viewportForPoint,
} from '@embedpdf/engine-core/runtime';
import type {
  AreaUnit,
  LengthUnit,
  PageMeasurementViewport,
  PdfMeasure,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import type { MeasurementConfig, PageScale, ScalePreset } from './types';

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

export function selectPageScale(
  viewports: PageMeasurementViewport[],
  crop: PdfRect,
  fallback: PdfMeasure,
  persistent: boolean,
): PageScale {
  const selected =
    viewports.find((v) => v.owned) ??
    viewportForPoint(viewports, {
      x: (crop.left + crop.right) / 2,
      y: (crop.top + crop.bottom) / 2,
    });
  return {
    measure: selected ? (selected.measure ?? null) : fallback,
    source: selected ? (selected.owned ? 'owned' : 'foreign') : 'default',
    ready: true,
    persistent,
  };
}

export function withUnit(
  m: PdfMeasure,
  unit: LengthUnit,
  area: AreaUnit = squareOf(unit),
): PdfMeasure {
  const basis = m.x[0]?.unit.trim() as LengthUnit;
  if (!(basis in METRES)) {
    throw new RangeError('This scale has an unknown base unit; calibrate it first');
  }
  const previous = m.distance[m.distance.length - 1];
  const precision = previous?.fraction === 'fraction' ? 100 : (previous?.precision ?? 100);
  return {
    ...m,
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

export function withPrecision(m: PdfMeasure, precision: number): PdfMeasure {
  if (!Number.isInteger(Math.log10(precision)) || precision < 1 || precision > 1e9) {
    throw new RangeError('Invalid decimal precision');
  }
  const update = (formats: PdfMeasure['distance']) =>
    formats.map((f, i) =>
      i === formats.length - 1 ? { ...f, precision, fraction: 'decimal' as const } : f,
    );
  return { ...m, distance: update(m.distance), area: update(m.area) };
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
