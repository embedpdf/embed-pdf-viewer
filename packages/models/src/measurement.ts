/**
 * Pure geometry/units math for measurement annotations.
 *
 * This module is intentionally framework- and engine-agnostic: it operates only
 * on the model types from `./pdf` and the geometry primitives from `./geometry`,
 * so it can be shared by the engine, the annotation plugin, and every framework
 * binding. All "page point" values are PDF user-space units (1pt = 1/72 inch);
 * the annotation geometry stored on `PdfAnnotationObject`s is already expressed
 * in this space (at scale 1), so distances/areas computed here are directly
 * convertible to real-world units via a {@link PdfMeasurementScale}.
 *
 * @packageDocumentation
 */
import { Position, Rect } from './geometry';
import {
  PdfMeasurementInfo,
  PdfMeasurementPrecision,
  PdfMeasurementScale,
  PdfMeasurementUnit,
  PdfAnnotationSubtype,
  PdfCircleAnnoObject,
  PdfLineAnnoObject,
  PdfPolygonAnnoObject,
  PdfPolylineAnnoObject,
  PdfSquareAnnoObject,
} from './pdf';

/**
 * Reserved key under an annotation's `custom` channel where measurement
 * metadata is persisted. Namespaced to avoid collisions with consumer data.
 */
export const MEASUREMENT_CUSTOM_KEY = '@embedpdf/measurement';

const MM_PER_PT = 25.4 / 72;

/**
 * How many of a given unit fit in one PDF point (1pt = 1/72 inch).
 * Used both for inter-unit conversion and for applying a scale.
 */
const UNIT_PER_PT: Record<PdfMeasurementUnit, number> = {
  [PdfMeasurementUnit.PT]: 1,
  [PdfMeasurementUnit.IN]: 1 / 72,
  [PdfMeasurementUnit.MM]: MM_PER_PT,
  [PdfMeasurementUnit.CM]: MM_PER_PT / 10,
  [PdfMeasurementUnit.M]: MM_PER_PT / 1000,
  [PdfMeasurementUnit.FT]: 1 / 72 / 12,
  [PdfMeasurementUnit.YD]: 1 / 72 / 36,
};

/** Conversion factor: how many `to` units are in one `from` unit. */
export function convertUnit(from: PdfMeasurementUnit, to: PdfMeasurementUnit): number {
  return UNIT_PER_PT[to] / UNIT_PER_PT[from];
}

/**
 * Linear multiplier that converts a page-point length into real-world `target`
 * units, given a calibration `scale`.
 *
 * `scale` says `scale.pagePoints` page points represent `scale.value`
 * `scale.unit`; this returns `target` units per page point.
 */
export function scaleFactor(scale: PdfMeasurementScale, target: PdfMeasurementUnit): number {
  if (!scale.pagePoints) return 0;
  return (scale.value / scale.pagePoints) * convertUnit(scale.unit, target);
}

/** Euclidean distance between two points (page points). */
export function pointDistance(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/** Total length of an open path through `pts` (page points). */
export function polylineLength(pts: Position[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pointDistance(pts[i - 1], pts[i]);
  return total;
}

/** Perimeter of a closed polygon defined by `pts` (page points). */
export function polygonPerimeter(pts: Position[]): number {
  if (pts.length < 2) return 0;
  return polylineLength(pts) + pointDistance(pts[pts.length - 1], pts[0]);
}

/** Signed-area-free polygon area via the shoelace formula (page points²). */
export function polygonArea(pts: Position[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Area of an axis-aligned rectangle (page points²). Rotation preserves area. */
export function rectArea(rect: Rect): number {
  return Math.abs(rect.size.width * rect.size.height);
}

/** Area of the ellipse inscribed in `rect` (page points²). */
export function ellipseArea(rect: Rect): number {
  return (Math.PI * Math.abs(rect.size.width) * Math.abs(rect.size.height)) / 4;
}

/**
 * Convert a raw page-point measurement into real-world `target` units.
 * For areas the linear scale factor is squared.
 */
export function toRealValue(
  pagePtValue: number,
  scale: PdfMeasurementScale,
  target: PdfMeasurementUnit,
  isArea: boolean,
): number {
  const f = scaleFactor(scale, target);
  return isArea ? pagePtValue * f * f : pagePtValue * f;
}

/** Greatest common divisor (for reducing fractions). */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

/**
 * Format a non-negative number according to a {@link PdfMeasurementPrecision}.
 * Decimal → fixed places. Fraction → nearest `1/denominator` rendered as
 * `whole n/d` (e.g. `3 1/2`, `1/4`, `2`).
 */
export function formatNumber(value: number, precision: PdfMeasurementPrecision): string {
  if (precision.type === 'fraction') {
    const denom = Math.max(1, Math.round(precision.denominator));
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    let whole = Math.floor(abs);
    let num = Math.round((abs - whole) * denom);
    if (num >= denom) {
      // Rounding carried over into the next whole unit.
      whole += 1;
      num = 0;
    }
    if (num === 0) return `${sign}${whole}`;
    const g = gcd(num, denom);
    const frac = `${num / g}/${denom / g}`;
    return whole === 0 ? `${sign}${frac}` : `${sign}${whole} ${frac}`;
  }
  const places = Math.max(0, Math.min(6, Math.round(precision.places)));
  return value.toFixed(places);
}

/** The label appended to a value for a unit, with `²` for area units. */
export function unitLabel(unit: PdfMeasurementUnit, isArea: boolean): string {
  return isArea ? `${unit}²` : unit;
}

/** Whether a measurement mode reports an area (vs. a linear length). */
export function isAreaMode(info: Pick<PdfMeasurementInfo, 'mode'>): boolean {
  return info.mode === 'area';
}

/**
 * Format a raw page-point measurement into a display string, e.g.
 * `"12.5 cm"`, `"3 1/2 in"`, or `"10.00 m (32.81 ft)"` when a secondary unit
 * is configured. Area measurements always use decimal formatting (fractional
 * areas are not meaningful) and append a squared unit label.
 */
export function formatMeasurement(
  pagePtValue: number,
  info: PdfMeasurementInfo,
  isArea: boolean = isAreaMode(info),
): string {
  const primaryPrecision: PdfMeasurementPrecision =
    isArea && info.precision.type === 'fraction' ? { type: 'decimal', places: 2 } : info.precision;
  const primaryVal = toRealValue(pagePtValue, info.scale, info.unit, isArea);
  let out = `${formatNumber(primaryVal, primaryPrecision)} ${unitLabel(info.unit, isArea)}`;

  if (info.secondary) {
    const secPrecision: PdfMeasurementPrecision =
      isArea && info.secondary.precision.type === 'fraction'
        ? { type: 'decimal', places: 2 }
        : info.secondary.precision;
    const secVal = toRealValue(pagePtValue, info.scale, info.secondary.unit, isArea);
    out += ` (${formatNumber(secVal, secPrecision)} ${unitLabel(info.secondary.unit, isArea)})`;
  }

  return out;
}

/** Any geometry annotation that can carry measurement metadata. */
export type MeasurableAnnotation =
  | PdfLineAnnoObject
  | PdfPolylineAnnoObject
  | PdfPolygonAnnoObject
  | PdfCircleAnnoObject
  | PdfSquareAnnoObject;

/**
 * Compute the raw page-point measurement value for an annotation, dispatching
 * on its type and (for polygons) its measurement `mode`. Returns a length for
 * distance/perimeter modes and an area for area mode.
 */
export function measurePagePtValue(anno: MeasurableAnnotation): number {
  const mode = anno.measurement?.mode;
  switch (anno.type) {
    case PdfAnnotationSubtype.LINE:
      return pointDistance(anno.linePoints.start, anno.linePoints.end);
    case PdfAnnotationSubtype.POLYLINE:
      return mode === 'area' ? polygonArea(anno.vertices) : polylineLength(anno.vertices);
    case PdfAnnotationSubtype.POLYGON:
      return mode === 'perimeter' ? polygonPerimeter(anno.vertices) : polygonArea(anno.vertices);
    // For rotated rect-based shapes `rect` is the axis-aligned bounding box;
    // the true (unrotated) dimensions live in `unrotatedRect`. Rotation
    // preserves area, so measure from the unrotated frame when present.
    case PdfAnnotationSubtype.CIRCLE:
      return ellipseArea(anno.unrotatedRect ?? anno.rect);
    case PdfAnnotationSubtype.SQUARE:
      return rectArea(anno.unrotatedRect ?? anno.rect);
    default:
      return 0;
  }
}

/**
 * Convenience: compute and format the display label for a measurement
 * annotation. Returns `undefined` when the annotation has no measurement info.
 */
export function measurementLabel(anno: MeasurableAnnotation): string | undefined {
  if (!anno.measurement) return undefined;
  return formatMeasurement(measurePagePtValue(anno), anno.measurement);
}

/**
 * Derive a calibration scale from two points the user drew across a feature of
 * known real-world length. e.g. the user draws a line over a "10 m" scale bar.
 */
export function scaleFromTwoPoints(
  a: Position,
  b: Position,
  realValue: number,
  realUnit: PdfMeasurementUnit,
): PdfMeasurementScale {
  return { value: realValue, unit: realUnit, pagePoints: pointDistance(a, b) };
}

/** A sensible 1:1 default scale (1 page point = 1 point). */
export const DEFAULT_MEASUREMENT_SCALE: PdfMeasurementScale = {
  value: 1,
  unit: PdfMeasurementUnit.PT,
  pagePoints: 1,
};
