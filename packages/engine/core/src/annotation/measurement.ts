/**
 * Measurement calibration — the unit vocabulary, the page-unit ⇄ real-world
 * scale, and the pure formatting math shared by the engine, the annotation
 * core, the plugin and every framework binding.
 *
 * A measurement annotation is an ordinary geometry annotation (line, polyline,
 * polygon, circle, square) that additionally carries a {@link MeasurementInfo}
 * describing how to turn its on-page geometry into a real-world value. This
 * module owns everything that is NOT geometry: units, scale, rounding and the
 * display string. The geometry half (which formula a given shape uses, where
 * the label sits) lives in `@embedpdf/core-annotation`'s `measure.ts`, because
 * it needs the content-space `Geom` vocabulary the renderer speaks.
 *
 * All raw values here are PDF user-space points (1pt = 1/72 inch) — the space
 * the engine's `linePoints` / `vertices` / `rect` are already expressed in — so
 * a raw value times a {@link MeasurementScale} is directly a real-world number.
 */

/**
 * Units a measurement can be expressed in. `pt` is PDF user space (1/72 inch);
 * every other unit converts relative to it. These string values double as the
 * label appended to a formatted measurement, so they are lowercase symbols
 * rather than names.
 */
export type MeasurementUnit = 'pt' | 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'yd';

/** Every {@link MeasurementUnit}, in the order a unit picker should list them. */
export const MEASUREMENT_UNITS: readonly MeasurementUnit[] = [
  'mm',
  'cm',
  'm',
  'in',
  'ft',
  'yd',
  'pt',
] as const;

/**
 * How a measurement value is rounded and rendered.
 *
 * - `decimal` — a fixed number of places (`12.50`).
 * - `fraction` — the nearest `1/denominator`, rendered whole-plus-fraction
 *   (`3 1/2`). Only meaningful for linear measurements; an area always falls
 *   back to decimal (see {@link formatMeasurement}).
 */
export type MeasurementPrecision =
  | { type: 'decimal'; places: number }
  | { type: 'fraction'; denominator: number };

/**
 * Page-unit ⇄ real-world calibration. Reads as: `pagePoints` PDF points on the
 * page represent `value` `unit` in the real world — so
 * `{ pagePoints: 72, value: 10, unit: 'ft' }` is "1 inch on the page = 10 feet".
 */
export interface MeasurementScale {
  /** Real-world magnitude that `pagePoints` page points map to. */
  value: number;
  /** Real-world unit `value` is expressed in. */
  unit: MeasurementUnit;
  /** Number of PDF page points (1/72 inch) that map to `value` `unit`. */
  pagePoints: number;
}

/** An optional second read-out rendered after the primary (metres AND feet). */
export interface MeasurementSecondary {
  unit: MeasurementUnit;
  precision: MeasurementPrecision;
}

/** The kind of quantity a measurement annotation reports. */
export type MeasurementMode = 'distance' | 'perimeter' | 'area';

/**
 * Calibration + formatting metadata attached to a measurement annotation.
 * Persisted verbatim as JSON under `/EMBD_Metadata/Measurement`; the spec `/IT`
 * intent ({@link MeasurementIntent}) is written alongside so a foreign viewer
 * can at least recognise the annotation as a dimension.
 */
export interface MeasurementInfo {
  /** What this annotation measures. Selects the geometry formula. */
  mode: MeasurementMode;
  /** Page-unit ⇄ real-world calibration used to convert the geometry. */
  scale: MeasurementScale;
  /** Unit the primary value is displayed in. */
  unit: MeasurementUnit;
  /** Rounding/formatting of the primary value. */
  precision: MeasurementPrecision;
  /** Optional secondary read-out shown in parentheses after the primary. */
  secondary?: MeasurementSecondary;
}

/**
 * PDF `/IT` values that mark a geometry annotation as a measurement
 * (ISO 32000-2 §12.5.6.9). `PolygonDimension` covers every area shape,
 * including the rect/ellipse ones carried by square/circle.
 */
export type MeasurementIntent = 'LineDimension' | 'PolyLineDimension' | 'PolygonDimension';

/** A sensible identity calibration: 1 page point = 1 point. */
export const DEFAULT_MEASUREMENT_SCALE: MeasurementScale = {
  value: 1,
  unit: 'pt',
  pagePoints: 1,
};

const MM_PER_PT = 25.4 / 72;

/** How many of each unit fit in one PDF point. The basis for every conversion. */
const UNIT_PER_PT: Record<MeasurementUnit, number> = {
  pt: 1,
  in: 1 / 72,
  mm: MM_PER_PT,
  cm: MM_PER_PT / 10,
  m: MM_PER_PT / 1000,
  ft: 1 / 72 / 12,
  yd: 1 / 72 / 36,
};

/** Conversion factor: how many `to` units are in one `from` unit. */
export function convertUnit(from: MeasurementUnit, to: MeasurementUnit): number {
  return UNIT_PER_PT[to] / UNIT_PER_PT[from];
}

/**
 * Linear multiplier turning a page-point length into real-world `target` units
 * under `scale`. Returns 0 for a degenerate calibration (no page extent), which
 * formats as a harmless `0` rather than `Infinity`/`NaN`.
 */
export function scaleFactor(scale: MeasurementScale, target: MeasurementUnit): number {
  if (!scale.pagePoints) return 0;
  return (scale.value / scale.pagePoints) * convertUnit(scale.unit, target);
}

/**
 * Convert a raw page-point measurement into real-world `target` units. An area
 * scales by the SQUARE of the linear factor.
 */
export function toRealValue(
  pagePtValue: number,
  scale: MeasurementScale,
  target: MeasurementUnit,
  isArea: boolean,
): number {
  const f = scaleFactor(scale, target);
  return isArea ? pagePtValue * f * f : pagePtValue * f;
}

/** Greatest common divisor, for reducing a fraction to lowest terms. */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/**
 * Render a number under a {@link MeasurementPrecision}. A fraction rounds to the
 * nearest `1/denominator` and reduces (`3 1/2`, `1/4`, `2`); the carry case
 * (`1.99` at halves) rolls into the next whole rather than printing `1 2/2`.
 */
export function formatNumber(value: number, precision: MeasurementPrecision): string {
  if (precision.type === 'fraction') {
    const denom = Math.max(1, Math.round(precision.denominator));
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    let whole = Math.floor(abs);
    let num = Math.round((abs - whole) * denom);
    if (num >= denom) {
      whole += 1;
      num = 0;
    }
    if (num === 0) return `${sign}${whole}`;
    const g = gcd(num, denom);
    return whole === 0
      ? `${sign}${num / g}/${denom / g}`
      : `${sign}${whole} ${num / g}/${denom / g}`;
  }
  const places = Math.max(0, Math.min(6, Math.round(precision.places)));
  return value.toFixed(places);
}

/** The unit suffix for a value — squared for an area. */
export function unitLabel(unit: MeasurementUnit, isArea: boolean): string {
  return isArea ? `${unit}²` : unit;
}

/** Whether a mode reports an area (rather than a linear length). */
export function isAreaMode(mode: MeasurementMode): boolean {
  return mode === 'area';
}

/**
 * Format a raw page-point measurement for display — `"12.5 cm"`, `"3 1/2 in"`,
 * or `"10.00 m (32.81 ft)"` when a secondary unit is configured.
 *
 * A fractional precision is silently downgraded to 2 decimal places for areas:
 * "7 3/8 m²" is not a reading anyone wants.
 */
export function formatMeasurement(
  pagePtValue: number,
  info: MeasurementInfo,
  isArea: boolean = isAreaMode(info.mode),
): string {
  const areaSafe = (p: MeasurementPrecision): MeasurementPrecision =>
    isArea && p.type === 'fraction' ? { type: 'decimal', places: 2 } : p;

  const primary = toRealValue(pagePtValue, info.scale, info.unit, isArea);
  let out = `${formatNumber(primary, areaSafe(info.precision))} ${unitLabel(info.unit, isArea)}`;

  if (info.secondary) {
    const sec = toRealValue(pagePtValue, info.scale, info.secondary.unit, isArea);
    out += ` (${formatNumber(sec, areaSafe(info.secondary.precision))} ${unitLabel(info.secondary.unit, isArea)})`;
  }
  return out;
}

/**
 * Derive a calibration from two points the user drew across a feature of known
 * real-world length — the "draw along the scale bar, type 10 m" gesture.
 * `pagePoints` is the drawn distance, so the caller passes page-space points.
 */
export function scaleFromPagePoints(
  drawnPagePoints: number,
  realValue: number,
  realUnit: MeasurementUnit,
): MeasurementScale {
  return { value: realValue, unit: realUnit, pagePoints: drawnPagePoints };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Validation
 *
 * A calibration read back out of a PDF is UNTRUSTED: it survives across our own
 * versions and any tool can write into a vendor dictionary. The engine's read
 * path is deliberately zod-free (it ships to the browser on every annotation
 * read), so the structural check lives here as a plain guard — next to the type
 * it validates, and usable from both sides of the wire.
 * ──────────────────────────────────────────────────────────────────────────── */

const isUnit = (v: unknown): v is MeasurementUnit =>
  typeof v === 'string' && (MEASUREMENT_UNITS as readonly string[]).includes(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isPrecision(v: unknown): v is MeasurementPrecision {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as { type?: unknown; places?: unknown; denominator?: unknown };
  if (p.type === 'decimal') return isFiniteNumber(p.places);
  if (p.type === 'fraction') return isFiniteNumber(p.denominator) && p.denominator >= 1;
  return false;
}

function isScale(v: unknown): v is MeasurementScale {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as { value?: unknown; unit?: unknown; pagePoints?: unknown };
  // `pagePoints` must be POSITIVE: a zero page extent is not a calibration, and
  // letting it through would make every read-out 0 with no way to tell why.
  return (
    isFiniteNumber(s.value) && isUnit(s.unit) && isFiniteNumber(s.pagePoints) && s.pagePoints > 0
  );
}

/**
 * Validate an arbitrary parsed value as a {@link MeasurementInfo}, or `null`.
 * A malformed calibration makes the annotation an ordinary shape again — never
 * a throw that would take down a whole page read.
 */
export function parseMeasurementInfo(value: unknown): MeasurementInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.mode !== 'distance' && v.mode !== 'perimeter' && v.mode !== 'area') return null;
  if (!isScale(v.scale) || !isUnit(v.unit) || !isPrecision(v.precision)) return null;

  const out: MeasurementInfo = {
    mode: v.mode,
    scale: v.scale,
    unit: v.unit,
    precision: v.precision,
  };

  if (v.secondary !== undefined && v.secondary !== null) {
    const sec = v.secondary as { unit?: unknown; precision?: unknown };
    // A broken secondary drops the SECONDARY only — the primary read-out is
    // still perfectly good, and losing it would be a worse outcome.
    if (isUnit(sec.unit) && isPrecision(sec.precision)) {
      out.secondary = { unit: sec.unit, precision: sec.precision };
    }
  }
  return out;
}

/**
 * The `/IT` intent that belongs on a measurement, or `null` when the spec
 * defines none for that shape.
 *
 * ISO 32000 defines measurement intents for Line, PolyLine and Polygon ONLY.
 * Rectangle and ellipse areas (Square/Circle) are an EmbedPDF extension, so
 * they deliberately carry NO `/IT`: stamping `PolygonDimension` on a Square
 * would be inventing spec vocabulary, and a foreign viewer that trusted it
 * would look for `/Vertices` that are not there. Those two are recognised as
 * measurements the same way we recognise every measurement — by the
 * calibration itself.
 */
export function measurementIntentFor(
  subtype: 'line' | 'polyline' | 'polygon' | 'circle' | 'square',
  mode: MeasurementMode,
): MeasurementIntent | null {
  if (subtype === 'line') return 'LineDimension';
  if (subtype === 'polyline') return mode === 'area' ? 'PolygonDimension' : 'PolyLineDimension';
  if (subtype === 'polygon') return 'PolygonDimension';
  return null;
}
