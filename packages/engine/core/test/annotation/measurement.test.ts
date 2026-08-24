import { describe, expect, it } from 'vitest';

import {
  convertUnit,
  formatMeasurement,
  formatNumber,
  measurementIntentFor,
  scaleFactor,
  scaleFromPagePoints,
  toRealValue,
  unitLabel,
} from '../../src/shared';
import type { MeasurementInfo } from '../../src/shared';

/** A 1:1 (1 page point = 1 pt) info, overridable per test. */
const info = (over: Partial<MeasurementInfo> = {}): MeasurementInfo => ({
  mode: 'distance',
  scale: { value: 1, unit: 'pt', pagePoints: 1 },
  unit: 'pt',
  precision: { type: 'decimal', places: 2 },
  ...over,
});

describe('unit conversion', () => {
  it('converts between the common units', () => {
    expect(convertUnit('cm', 'mm')).toBeCloseTo(10);
    expect(convertUnit('ft', 'in')).toBeCloseTo(12);
    expect(convertUnit('in', 'pt')).toBeCloseTo(72);
    expect(convertUnit('m', 'cm')).toBeCloseTo(100);
    expect(convertUnit('yd', 'ft')).toBeCloseTo(3);
  });

  it('round-trips a conversion back to identity', () => {
    expect(convertUnit('mm', 'yd') * convertUnit('yd', 'mm')).toBeCloseTo(1);
  });
});

describe('scaleFactor', () => {
  it('applies the calibration', () => {
    // 72 page points represent 1 inch → 1/72 in per point.
    expect(scaleFactor({ value: 1, unit: 'in', pagePoints: 72 }, 'in')).toBeCloseTo(1 / 72);
    // 72 page points represent 10 ft → 10/72 ft per point.
    expect(scaleFactor({ value: 10, unit: 'ft', pagePoints: 72 }, 'ft')).toBeCloseTo(10 / 72);
  });

  it('guards a degenerate calibration rather than dividing by zero', () => {
    expect(scaleFactor({ value: 10, unit: 'ft', pagePoints: 0 }, 'ft')).toBe(0);
  });

  it('converts into a target unit different from the scale unit', () => {
    // 72 pt = 1 ft, read out in inches → 12 in per 72 pt.
    expect(scaleFactor({ value: 1, unit: 'ft', pagePoints: 72 }, 'in')).toBeCloseTo(12 / 72);
  });
});

describe('toRealValue', () => {
  const scale = { value: 1, unit: 'in', pagePoints: 72 } as const;

  it('scales a length linearly', () => {
    expect(toRealValue(144, scale, 'in', false)).toBeCloseTo(2);
  });

  it('scales an area by the square of the linear factor', () => {
    // 144×144 pt² = 2in × 2in = 4 in².
    expect(toRealValue(144 * 144, scale, 'in', true)).toBeCloseTo(4);
  });
});

describe('formatNumber', () => {
  it('renders decimal places', () => {
    expect(formatNumber(12.3456, { type: 'decimal', places: 2 })).toBe('12.35');
    expect(formatNumber(12.3456, { type: 'decimal', places: 0 })).toBe('12');
  });

  it('clamps the decimal places to a sane range', () => {
    expect(formatNumber(1.5, { type: 'decimal', places: -3 })).toBe('2');
    expect(formatNumber(1 / 3, { type: 'decimal', places: 99 })).toBe('0.333333');
  });

  it('renders whole-plus-fraction and reduces to lowest terms', () => {
    expect(formatNumber(3.5, { type: 'fraction', denominator: 8 })).toBe('3 1/2');
    expect(formatNumber(0.25, { type: 'fraction', denominator: 8 })).toBe('1/4');
    expect(formatNumber(2, { type: 'fraction', denominator: 8 })).toBe('2');
  });

  it('carries a rounded fraction into the next whole instead of printing n/n', () => {
    expect(formatNumber(1.99, { type: 'fraction', denominator: 2 })).toBe('2');
  });

  it('keeps the sign on a negative fraction', () => {
    expect(formatNumber(-3.5, { type: 'fraction', denominator: 2 })).toBe('-3 1/2');
  });
});

describe('unitLabel', () => {
  it('squares the unit for an area', () => {
    expect(unitLabel('m', false)).toBe('m');
    expect(unitLabel('m', true)).toBe('m²');
  });
});

describe('formatMeasurement', () => {
  it('formats a calibrated distance', () => {
    // 1 inch on the page = 10 ft; a 144pt (2in) line is 20 ft.
    const out = formatMeasurement(
      144,
      info({ scale: { value: 10, unit: 'ft', pagePoints: 72 }, unit: 'ft' }),
    );
    expect(out).toBe('20.00 ft');
  });

  it('appends a secondary read-out in parentheses', () => {
    const out = formatMeasurement(
      72,
      info({
        scale: { value: 1, unit: 'in', pagePoints: 72 },
        unit: 'in',
        precision: { type: 'decimal', places: 1 },
        secondary: { unit: 'mm', precision: { type: 'decimal', places: 1 } },
      }),
    );
    expect(out).toBe('1.0 in (25.4 mm)');
  });

  it('downgrades a fractional precision to decimals for an area', () => {
    const out = formatMeasurement(
      144 * 144,
      info({
        mode: 'area',
        scale: { value: 1, unit: 'in', pagePoints: 72 },
        unit: 'in',
        precision: { type: 'fraction', denominator: 8 },
      }),
    );
    expect(out).toBe('4.00 in²');
  });

  it('keeps fractions for a linear measurement', () => {
    const out = formatMeasurement(
      108,
      info({
        scale: { value: 1, unit: 'in', pagePoints: 72 },
        unit: 'in',
        precision: { type: 'fraction', denominator: 8 },
      }),
    );
    expect(out).toBe('1 1/2 in');
  });

  it('formats a degenerate calibration as zero rather than NaN', () => {
    const out = formatMeasurement(100, info({ scale: { value: 1, unit: 'm', pagePoints: 0 } }));
    expect(out).toBe('0.00 pt');
  });
});

describe('scaleFromPagePoints', () => {
  it('derives a calibration from a drawn reference length', () => {
    expect(scaleFromPagePoints(144, 10, 'm')).toEqual({
      value: 10,
      unit: 'm',
      pagePoints: 144,
    });
  });

  it('round-trips: the reference line measures back to what was typed', () => {
    const scale = scaleFromPagePoints(144, 10, 'm');
    expect(toRealValue(144, scale, 'm', false)).toBeCloseTo(10);
  });
});

describe('measurementIntentFor', () => {
  it('maps each subtype/mode pair onto its spec /IT value', () => {
    expect(measurementIntentFor('line', 'distance')).toBe('LineDimension');
    expect(measurementIntentFor('polyline', 'perimeter')).toBe('PolyLineDimension');
    expect(measurementIntentFor('polyline', 'area')).toBe('PolygonDimension');
    expect(measurementIntentFor('polygon', 'area')).toBe('PolygonDimension');
    expect(measurementIntentFor('polygon', 'perimeter')).toBe('PolygonDimension');
  });

  it('gives rect/ellipse areas NO intent — the spec defines none for them', () => {
    // Stamping `PolygonDimension` on a Square would invent spec vocabulary, and
    // a viewer that trusted it would look for `/Vertices` that are not there.
    expect(measurementIntentFor('square', 'area')).toBeNull();
    expect(measurementIntentFor('circle', 'area')).toBeNull();
  });
});
