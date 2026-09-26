import { describe, expect, test } from 'vitest';
import {
  assertWritableMeasure,
  formatMeasurement,
  isReadout,
  measurementReadout,
  measureFromKnownLength,
  measureFromRatio,
  polygonArea,
  viewportForPoint,
} from '../src/measure';
import type { PdfMeasure, PdfViewport } from '../src/dto/Measure';
import { LinePatchSchema, PolygonPatchSchema } from '../src/annotation/kinds';
import { PdfMeasureSchema, PdfMeasureWriteSchema } from '../src/dto/Measure.schema';

describe('measurement arithmetic and formatting', () => {
  test('ISO multi-unit example and exact stop', () => {
    const formats = [
      { unit: 'mi', conversion: 1 },
      { unit: 'ft', conversion: 5280 },
      { unit: 'in', conversion: 12, fraction: 'fraction' as const, precision: 8 },
    ];
    expect(formatMeasurement(1.4505, formats)).toBe('1 mi 2,378 ft 7 5/8 in');
    expect(formatMeasurement(2, [{ unit: 'ft', conversion: 1 }, formats[2]])).toBe('2 ft');
  });
  test('fractions reduce, fixed denominators stay fixed, and rounding carries', () => {
    const nf = { unit: 'in', conversion: 1, fraction: 'fraction' as const, precision: 16 };
    expect(formatMeasurement(1.5, [nf])).toBe('1 1/2 in');
    expect(formatMeasurement(1.5, [{ ...nf, fixed: true }])).toBe('1 8/16 in');
    expect(formatMeasurement(1.999, [nf])).toBe('2 in');
  });
  test('decimal empty means dot; grouping and literal spacing stay distinct', () => {
    expect(
      formatMeasurement(1234.5, [
        {
          unit: 'm ',
          conversion: 1,
          precision: 100,
          fixed: true,
          thousands: '',
          decimal: '',
          suffixSpacing: '',
        },
      ]),
    ).toBe('1234.50 m ');
    expect(
      formatMeasurement(1234.5, [
        {
          unit: '$',
          conversion: 1,
          labelPosition: 'prefix',
          prefixSpacing: '',
          suffixSpacing: '',
          fixed: true,
        },
      ]),
    ).toBe('$1,234.50');
    expect(formatMeasurement(-1234.5, [{ unit: 'm', conversion: 1, thousands: '$' }])).toBe(
      '-1$234.50 m',
    );
  });
  test('decimals show every digit /RD asks for, with or without /FD, as Acrobat does', () => {
    const metric = { unit: 'm ', conversion: 1, precision: 100 };
    expect(formatMeasurement(1.5, [metric])).toBe('1.50 m ');
    expect(formatMeasurement(2, [metric])).toBe('2.00 m ');
    expect(formatMeasurement(2, [{ ...metric, precision: 1 }])).toBe('2 m ');
  });
  test('round and truncate modes', () => {
    expect(formatMeasurement(1.8, [{ unit: 'm', conversion: 1, fraction: 'round' }])).toBe('2 m');
    expect(formatMeasurement(1.8, [{ unit: 'm', conversion: 1, fraction: 'truncate' }])).toBe(
      '1 m',
    );
  });
  test('calibration and user unit', () => {
    expect(measureFromKnownLength(100, { value: 3, unit: 'm' }).x[0].conversion).toBe(
      Math.fround(0.03),
    );
    expect(measureFromRatio(1, 50, 'm', 2).x[0].conversion).toBe(
      Math.fround((2 / 72) * 0.0254 * 50),
    );
    expect(() => measureFromKnownLength(0, { value: 1, unit: 'm' })).toThrow();
  });
  test('coordinates AND scale factors are normalized to PDF float32', () => {
    const m = measureFromKnownLength(1, { value: 1.00000001, unit: 'm' });
    const d = {
      subtype: 'line',
      intent: 'line-dimension',
      measure: m,
      linePoints: { start: { x: 0, y: 0 }, end: { x: 3.4450000001, y: 0 } },
    };
    const a = measurementReadout(d);
    const b = measurementReadout({
      ...d,
      linePoints: { ...d.linePoints, end: { x: Math.fround(3.4450000001), y: 0 } },
    });
    expect(a).toEqual(b);
    expect(isReadout(a) && a.label).toBe('3.44 m');
  });
  test('anisotropic scale requires CYX; missing conversion is unavailable', () => {
    const m: PdfMeasure = {
      subtype: 'rectilinear',
      x: [{ unit: 'm', conversion: 1 }],
      y: [{ unit: 'm', conversion: 2 }],
      distance: [{ unit: 'm', conversion: 1 }],
      area: [],
    };
    const d = {
      subtype: 'line',
      intent: 'line-dimension',
      measure: m,
      linePoints: { start: { x: 0, y: 0 }, end: { x: 3, y: 2 } },
    };
    expect(measurementReadout(d)).toEqual({ unavailable: 'no-scale' });
    expect(measurementReadout({ ...d, measure: { ...m, cyx: 1 } })).toMatchObject({
      value: 5,
      label: '5.00 m',
    });
    expect(measurementReadout({ ...d, measure: { ...m, x: [{ unit: 'm' }] } })).toEqual({
      unavailable: 'no-scale',
    });
    expect(() => assertWritableMeasure({ ...m, distance: [{ unit: 'm' }] })).toThrow();
  });
  test('area uses stable shoelace at shifted origins; readout value uses display units', () => {
    const points = [
      { x: 1e6, y: 1e6 },
      { x: 1e6 + 4, y: 1e6 },
      { x: 1e6 + 4, y: 1e6 + 4 },
      { x: 1e6 + 2, y: 1e6 + 2 },
      { x: 1e6, y: 1e6 + 4 },
    ];
    expect(polygonArea(points, { sx: 2, sy: 3 })).toBe(72);
    const measure = measureFromKnownLength(
      1,
      { value: 1, unit: 'm' },
      { precision: 100, areaUnit: 'ha' },
    );
    const r = measurementReadout({
      subtype: 'polygon',
      intent: 'polygon-dimension',
      measure,
      vertices: points,
    });
    expect(isReadout(r) && r.value).toBeCloseTo(0.0012);
  });
  test('viewport selection is last-containing, foreign included', () => {
    const a: PdfViewport = {
      bbox: { left: -20, right: 100, bottom: -40, top: 100 },
      name: null,
      measure: { subtype: 'geospatial' },
    };
    expect(viewportForPoint([a, { ...a, name: 'last' }], { x: 0, y: 0 })?.name).toBe('last');
    expect(viewportForPoint([a], { x: -30, y: 0 })).toBeUndefined();
  });
  test('wire schemas distinguish line vectors, shape points, and caption resets', () => {
    expect(
      LinePatchSchema.safeParse({ subtype: 'line', captionOffset: { x: 1, y: 2 } }).success,
    ).toBe(false);
    expect(PolygonPatchSchema.parse({ subtype: 'polygon', captionCenter: null })).toEqual({
      subtype: 'polygon',
      captionCenter: null,
    });
  });
  test('an update may send back the marker of a scale the engine cannot model', () => {
    expect(
      LinePatchSchema.safeParse({ subtype: 'line', measure: { subtype: 'geospatial' } }).success,
    ).toBe(true);
  });
  test('malformed imported factors remain readable, but cannot be authored', () => {
    const imported = {
      subtype: 'rectilinear',
      x: [{ unit: 'm', conversion: 0 }],
      distance: [{ unit: 'm' }],
      area: [],
      cyx: -1,
    };
    expect(PdfMeasureSchema.parse(imported)).toEqual(imported);
    expect(PdfMeasureWriteSchema.safeParse(imported).success).toBe(false);
    expect(
      PdfMeasureWriteSchema.safeParse({ ...imported, x: [{ unit: 'm', conversion: 1 }], cyx: 1 })
        .success,
    ).toBe(false);
  });
});

describe('area boundary validity', () => {
  const measure = measureFromKnownLength(1, { value: 1, unit: 'm' });
  const read = (points: number[][]) =>
    measurementReadout({
      subtype: 'polygon',
      intent: 'polygon-dimension',
      measure,
      vertices: points.map(([x, y]) => ({ x, y })),
    });

  test.each([
    [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ],
    [
      [0, 0],
      [10, 10],
      [20, 20],
    ],
    [
      [0, 0],
      [10, 0],
      [5, 0],
      [10, 10],
    ],
    [
      [0, 0],
      [10, 0],
      [10, 0],
      [10, 10],
    ],
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [5, 0],
      [10, 10],
    ],
  ])('rejects crossing, touching, overlapping and degenerate boundaries: %j', (...points) => {
    expect(read(points)).toEqual({ unavailable: 'invalid-geometry' });
  });

  test('accepts either winding, collinear forward edges, a repeated closing vertex and a large origin', () => {
    const points = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    for (const ring of [
      points,
      [...points].reverse(),
      points.map(([x, y]) => [x + 10000, y - 20000]),
    ]) {
      expect(read(ring)).toMatchObject({ label: '100.00 m²', perimeter: '40.00 m' });
    }
  });
});
