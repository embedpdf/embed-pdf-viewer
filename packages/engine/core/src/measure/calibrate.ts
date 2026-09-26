import { assertWritableMeasure } from './validate';
import type { PdfMeasure, PdfNumberFormat } from '../dto/Measure';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import {
  areaUnitLabel,
  METRES,
  squareMetres,
  squareOf,
  type AreaUnit,
  type LengthUnit,
} from './units';

export interface MeasurementFormatOptions {
  /** Decimals, as 1, 10, 100, …: 100 shows two. Default 100. */
  precision?: number;
  fixed?: boolean;
  areaUnit?: AreaUnit;
  imperialFeetInches?: boolean;
  /** Inch fraction denominator when imperialFeetInches is true. Default 16. */
  fractionalPrecision?: number;
}
/** {@link measureFromRatio}'s options: how values are shown, and the page's user unit. */
export interface MeasureFromRatioOptions extends MeasurementFormatOptions {
  /** The page's `/UserUnit`: a point is this many 1/72 inch. Default 1. */
  userUnit?: number;
}

function invalid(message: string): EngineError {
  return new EngineError(EngineErrorCode.InvalidArg, message);
}

function positive(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw invalid('Calibration requires finite positive lengths and scales');
  }
}
function build(
  perPoint: number,
  unit: LengthUnit,
  ratio: string,
  format: MeasurementFormatOptions,
): PdfMeasure {
  positive(Math.fround(perPoint));
  const precision = format.precision ?? 100;
  if (!Number.isInteger(Math.log10(precision)) || precision < 1 || precision > 1e9) {
    throw invalid('Invalid decimal precision');
  }
  const areaUnit = format.areaUnit ?? squareOf(unit);
  const common = {
    precision,
    ...(format.fixed === undefined ? {} : { fixed: format.fixed }),
  };
  const distance: PdfNumberFormat[] = format.imperialFeetInches
    ? [
        { unit: 'ft', conversion: Math.fround(METRES[unit] / METRES.ft) },
        {
          unit: 'in',
          conversion: 12,
          fraction: 'fraction',
          precision: format.fractionalPrecision ?? 16,
          ...('fixed' in common ? { fixed: common.fixed } : {}),
        },
      ]
    : [{ unit, conversion: 1, ...common }];
  if (
    format.imperialFeetInches &&
    (!Number.isInteger(distance[1].precision) ||
      distance[1].precision! < 1 ||
      distance[1].precision! > 2147483647)
  )
    throw invalid('Invalid fraction denominator');
  const measure: PdfMeasure = {
    subtype: 'rectilinear',
    ratio,
    x: [{ unit, conversion: Math.fround(perPoint), ...common }],
    distance,
    area: [
      {
        unit: areaUnitLabel(areaUnit),
        conversion: Math.fround(METRES[unit] ** 2 / squareMetres(areaUnit)),
        ...common,
      },
    ],
  };
  assertWritableMeasure(measure);
  return measure;
}
export function measureFromKnownLength(
  userSpaceLength: number,
  real: { value: number; unit: LengthUnit },
  format: MeasurementFormatOptions = {},
): PdfMeasure {
  positive(userSpaceLength);
  positive(real.value);
  const perPoint = real.value / userSpaceLength;
  return build(
    perPoint,
    real.unit,
    `1 in = ${Number((perPoint * 72).toPrecision(8))} ${real.unit}`,
    format,
  );
}
export function measureFromRatio(
  paper: number,
  real: number,
  unit: LengthUnit,
  options: MeasureFromRatioOptions = {},
): PdfMeasure {
  const { userUnit = 1, ...format } = options;
  positive(paper);
  positive(real);
  positive(userUnit);
  return build(
    ((userUnit / 72) * 0.0254 * (real / paper)) / METRES[unit],
    unit,
    `${paper}:${real}`,
    format,
  );
}
