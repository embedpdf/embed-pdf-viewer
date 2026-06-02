import {
  convertUnit,
  scaleFactor,
  pointDistance,
  polylineLength,
  polygonPerimeter,
  polygonArea,
  rectArea,
  ellipseArea,
  toRealValue,
  formatNumber,
  formatMeasurement,
  measurePagePtValue,
  measurementLabel,
  scaleFromTwoPoints,
} from './measurement';
import { PdfAnnotationSubtype, PdfMeasurementInfo, PdfMeasurementUnit } from './pdf';

const U = PdfMeasurementUnit;

describe('Measurement units', () => {
  test('convertUnit between common units', () => {
    expect(convertUnit(U.CM, U.MM)).toBeCloseTo(10);
    expect(convertUnit(U.FT, U.IN)).toBeCloseTo(12);
    expect(convertUnit(U.IN, U.PT)).toBeCloseTo(72);
    expect(convertUnit(U.M, U.CM)).toBeCloseTo(100);
    expect(convertUnit(U.YD, U.FT)).toBeCloseTo(3);
  });

  test('scaleFactor applies calibration', () => {
    // 72 page points represent 1 inch => 1/72 in per point
    expect(scaleFactor({ value: 1, unit: U.IN, pagePoints: 72 }, U.IN)).toBeCloseTo(1 / 72);
    // 72 page points represent 10 ft => 10/72 ft per point
    expect(scaleFactor({ value: 10, unit: U.FT, pagePoints: 72 }, U.FT)).toBeCloseTo(10 / 72);
    // a zero-length calibration is guarded
    expect(scaleFactor({ value: 10, unit: U.FT, pagePoints: 0 }, U.FT)).toBe(0);
  });
});

describe('Measurement geometry', () => {
  test('pointDistance', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test('polylineLength sums open-path segments', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 0, y: 3 },
        { x: 4, y: 3 },
      ]),
    ).toBe(7);
  });

  test('polygonPerimeter closes the path', () => {
    expect(
      polygonPerimeter([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(40);
  });

  test('polygonArea via shoelace (order-independent)', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(100);
  });

  test('rectArea and ellipseArea', () => {
    const rect = { origin: { x: 0, y: 0 }, size: { width: 20, height: 5 } };
    expect(rectArea(rect)).toBe(100);
    expect(ellipseArea({ origin: { x: 0, y: 0 }, size: { width: 4, height: 2 } })).toBeCloseTo(
      Math.PI * 2,
    );
  });
});

describe('Measurement conversion', () => {
  test('toRealValue scales linear and squares for area', () => {
    // 144 pt at 72pt = 2ft => 4 ft
    expect(toRealValue(144, { value: 2, unit: U.FT, pagePoints: 72 }, U.FT, false)).toBeCloseTo(4);
    // area squares the factor
    expect(toRealValue(144, { value: 1, unit: U.IN, pagePoints: 72 }, U.IN, true)).toBeCloseTo(
      144 * (1 / 72) * (1 / 72),
    );
  });
});

describe('Measurement formatting', () => {
  test('formatNumber decimal', () => {
    expect(formatNumber(12.345, { type: 'decimal', places: 2 })).toBe('12.35');
    expect(formatNumber(12.345, { type: 'decimal', places: 0 })).toBe('12');
  });

  test('formatNumber fraction reduces and carries', () => {
    expect(formatNumber(3.5, { type: 'fraction', denominator: 16 })).toBe('3 1/2');
    expect(formatNumber(0.25, { type: 'fraction', denominator: 4 })).toBe('1/4');
    expect(formatNumber(2, { type: 'fraction', denominator: 8 })).toBe('2');
    expect(formatNumber(2.97, { type: 'fraction', denominator: 16 })).toBe('3');
  });

  test('formatMeasurement primary and secondary', () => {
    const info: PdfMeasurementInfo = {
      mode: 'distance',
      scale: { value: 10, unit: U.FT, pagePoints: 72 },
      unit: U.FT,
      precision: { type: 'decimal', places: 1 },
    };
    expect(formatMeasurement(100, info, false)).toBe('13.9 ft');
    expect(formatMeasurement(100, { ...info, secondary: { unit: U.M, precision: { type: 'decimal', places: 2 } } }, false)).toBe(
      '13.9 ft (4.23 m)',
    );
  });

  test('area always uses decimal and a squared unit label', () => {
    const info: PdfMeasurementInfo = {
      mode: 'area',
      scale: { value: 1, unit: U.M, pagePoints: 100 },
      unit: U.M,
      precision: { type: 'fraction', denominator: 16 },
    };
    expect(formatMeasurement(10000, info)).toBe('1.00 m²');
  });
});

describe('measurePagePtValue dispatch', () => {
  test('per-subtype dispatch', () => {
    expect(
      measurePagePtValue({
        type: PdfAnnotationSubtype.LINE,
        linePoints: { start: { x: 0, y: 0 }, end: { x: 3, y: 4 } },
      } as any),
    ).toBe(5);
    expect(
      measurePagePtValue({
        type: PdfAnnotationSubtype.SQUARE,
        rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      } as any),
    ).toBe(100);
    expect(
      measurePagePtValue({
        type: PdfAnnotationSubtype.POLYGON,
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        measurement: { mode: 'perimeter' },
      } as any),
    ).toBe(40);
  });

  test('rotated rect/ellipse area uses unrotatedRect, not the AABB', () => {
    // A 10x20 square rotated 45° has a larger axis-aligned bounding box, but
    // its true area is unchanged. measurePagePtValue must use unrotatedRect.
    expect(
      measurePagePtValue({
        type: PdfAnnotationSubtype.SQUARE,
        rect: { origin: { x: 0, y: 0 }, size: { width: 21.2, height: 21.2 } }, // AABB
        unrotatedRect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 20 } },
        rotation: 45,
      } as any),
    ).toBe(200);
  });

  test('measurementLabel end-to-end (1 inch line at 72pt = 10ft)', () => {
    expect(
      measurementLabel({
        type: PdfAnnotationSubtype.LINE,
        linePoints: { start: { x: 0, y: 0 }, end: { x: 0, y: 72 } },
        measurement: {
          mode: 'distance',
          scale: { value: 10, unit: U.FT, pagePoints: 72 },
          unit: U.FT,
          precision: { type: 'decimal', places: 1 },
        },
      } as any),
    ).toBe('10.0 ft');
  });
});

describe('scaleFromTwoPoints', () => {
  test('derives pagePoints from drawn length', () => {
    const scale = scaleFromTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, U.M);
    expect(scale).toEqual({ value: 10, unit: U.M, pagePoints: 100 });
  });
});
