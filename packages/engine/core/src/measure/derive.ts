import type { PdfMeasurement } from '../dto/Measure';
import type { LinePoints, PdfPoint } from '../geometry/primitives';
import { pathLength, polygonArea, scaleOf } from './compute';
import { formatMeasurement, validNumberFormat } from './format';

export interface DimensionInput {
  subtype: string;
  intent?: string | null;
  measure?: PdfMeasurement | null;
  linePoints?: LinePoints;
  vertices?: PdfPoint[];
  contents?: string | null;
}
export interface MeasurementReadout {
  kind: 'distance' | 'perimeter' | 'area';
  label: string;
  /** Value in the first display format's unit. */
  value: number;
  perimeter?: string;
}
export interface MeasurementUnavailable {
  unavailable:
    | 'not-dimension'
    | 'no-measure'
    | 'foreign-measure'
    | 'no-scale'
    | 'no-distance-format'
    | 'no-area-format'
    | 'invalid-format'
    | 'invalid-geometry';
}
export function isDimension(dto: { subtype: string; intent?: string | null }): boolean {
  return (
    (dto.subtype === 'line' && dto.intent === 'LineDimension') ||
    (dto.subtype === 'polyline' && dto.intent === 'PolyLineDimension') ||
    (dto.subtype === 'polygon' && dto.intent === 'PolygonDimension')
  );
}
export const isReadout = (
  r: MeasurementReadout | MeasurementUnavailable,
): r is MeasurementReadout => !('unavailable' in r);

export function measurementReadout(
  dto: DimensionInput,
): MeasurementReadout | MeasurementUnavailable {
  if (!isDimension(dto)) return { unavailable: 'not-dimension' };
  if (!dto.measure) return { unavailable: 'no-measure' };
  if (dto.measure.subtype !== 'RL') return { unavailable: 'foreign-measure' };
  const m = dto.measure,
    scale = scaleOf(m);
  if (!scale) return { unavailable: 'no-scale' };
  const points =
    dto.subtype === 'line'
      ? dto.linePoints
        ? [dto.linePoints.start, dto.linePoints.end]
        : []
      : (dto.vertices ?? []);
  if (
    points.length < (dto.subtype === 'polygon' ? 3 : 2) ||
    points.some((p) => !Number.isFinite(Math.fround(p.x)) || !Number.isFinite(Math.fround(p.y)))
  ) {
    return { unavailable: 'invalid-geometry' };
  }
  const area = dto.subtype === 'polygon';
  const formats = area ? m.area : m.distance;
  if (!formats.length) return { unavailable: area ? 'no-area-format' : 'no-distance-format' };
  if (!formats.every(validNumberFormat)) return { unavailable: 'invalid-format' };
  const value = area ? polygonArea(points, scale) : pathLength(points, false, scale);
  try {
    return {
      kind: area ? 'area' : dto.subtype === 'line' ? 'distance' : 'perimeter',
      value: value * Math.fround(formats[0].conversion!),
      label: formatMeasurement(value, formats),
      ...(area && m.distance.length && m.distance.every(validNumberFormat)
        ? { perimeter: formatMeasurement(pathLength(points, true, scale), m.distance) }
        : {}),
    };
  } catch {
    return { unavailable: 'invalid-format' };
  }
}

export function deriveMeasurementLabel<T extends DimensionInput>(dto: T): T {
  const readout = measurementReadout(dto);
  return isReadout(readout) && dto.contents !== readout.label
    ? { ...dto, contents: readout.label }
    : dto;
}
