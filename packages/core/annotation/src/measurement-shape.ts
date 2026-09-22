import { isReadout, measurementReadout } from '@embedpdf/engine-core/runtime';
import type { PdfMeasurement, PdfRect, ShapeDimensionCaption } from '@embedpdf/engine-core/runtime';
import { geomRotation, pointInPoly, rotatePoint, selectionQuad, unionRect } from './geometry';
import { DISTANCE_CAPTION_SIZE, distanceCaptionWidth } from './measurement-font';
import { distanceLayout, distanceSelectionQuad, moveDistanceCaption } from './measurement';
import type { DistanceCaptionLayout, MeasurementAppearance } from './measurement';
import type { ContentGeometry, Quad, Rect, Style, Point } from './types';

export interface ShapeMeasurementAppearance {
  intent: 'PolyLineDimension' | 'PolygonDimension';
  measure: PdfMeasurement | null;
  caption: ShapeDimensionCaption;
  crop: PdfRect;
  text: string;
}

export interface ShapeMeasurementLayout {
  caption: DistanceCaptionLayout | null;
  visualBounds: Rect;
  selectionPoints: Point[];
}

const ORIGIN = { x: 0, y: 0 };

/** The public caption center stays in PDF space; the editor draws in content space. */
export function shapeCaptionPoint(appearance: ShapeMeasurementAppearance): Point | undefined {
  const center = appearance.caption.center;
  return center && { x: center.x - appearance.crop.left, y: appearance.crop.top - center.y };
}

export function withShapeCaptionPoint(
  appearance: ShapeMeasurementAppearance,
  center: Point,
): ShapeMeasurementAppearance {
  return {
    ...appearance,
    caption: {
      ...appearance.caption,
      center: { x: center.x + appearance.crop.left, y: appearance.crop.top - center.y },
    },
  };
}

export function transformMeasurementCaption(
  appearance: MeasurementAppearance | undefined,
  transform: (point: Point) => Point,
): MeasurementAppearance | undefined {
  if (!appearance || appearance.intent === 'LineDimension') return appearance;
  const center = shapeCaptionPoint(appearance);
  return center ? withShapeCaptionPoint(appearance, transform(center)) : appearance;
}

export function shapeMeasurementReadout(
  geometry: ContentGeometry,
  appearance: ShapeMeasurementAppearance,
) {
  return measurementReadout({
    subtype: appearance.intent === 'PolygonDimension' ? 'polygon' : 'polyline',
    intent: appearance.intent,
    measure: appearance.measure,
    vertices:
      geometry.kind === 'poly'
        ? geometry.points.map((point) => ({
            x: point.x + appearance.crop.left,
            y: appearance.crop.top - point.y,
          }))
        : [],
  });
}

export function shapeMeasurementLabel(
  geometry: ContentGeometry,
  appearance: ShapeMeasurementAppearance,
): string {
  const readout = shapeMeasurementReadout(geometry, appearance);
  if (isReadout(readout)) return readout.label;
  return readout.unavailable === 'invalid-geometry' ? '—' : appearance.text;
}

/** Match the native shape-caption anchor, including an interior fallback for concave areas. */
export function automaticShapeCaptionCenter(points: readonly Point[], closed: boolean): Point {
  if (!points.length) return ORIGIN;
  if (!closed) {
    const lengths = points
      .slice(1)
      .map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i];
      if (length > 0 && remaining <= length) {
        const fraction = remaining / length;
        return {
          x: points[i].x + fraction * (points[i + 1].x - points[i].x),
          y:
            points[i].y +
            fraction * (points[i + 1].y - points[i].y) -
            DISTANCE_CAPTION_SIZE / 2 -
            2,
        };
      }
      remaining -= length;
    }
    return points[0];
  }

  const origin = points[0];
  let area = 0;
  let momentX = 0;
  let momentY = 0;
  for (let i = 0; i < points.length; i++) {
    const start = { x: points[i].x - origin.x, y: points[i].y - origin.y };
    const next = points[(i + 1) % points.length];
    const end = { x: next.x - origin.x, y: next.y - origin.y };
    const cross = start.x * end.y - end.x * start.y;
    area += cross;
    momentX += (start.x + end.x) * cross;
    momentY += (start.y + end.y) * cross;
  }
  if (Math.abs(area) > 1e-8) {
    const center = { x: origin.x + momentX / (3 * area), y: origin.y + momentY / (3 * area) };
    if (pointInPoly(center, points)) return center;
  }

  const bounds = unionRect([...points]);
  const fallback = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const intersections: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    if (start.y > fallback.y !== end.y > fallback.y) {
      intersections.push(
        start.x + ((fallback.y - start.y) * (end.x - start.x)) / (end.y - start.y),
      );
    }
  }
  intersections.sort((left, right) => left - right);
  let widest = -1;
  for (let i = 1; i < intersections.length; i += 2) {
    const width = intersections[i] - intersections[i - 1];
    if (width > widest) {
      widest = width;
      fallback.x = (intersections[i] + intersections[i - 1]) / 2;
    }
  }
  return fallback;
}

export function shapeMeasurementLayout(
  geometry: ContentGeometry,
  appearance: ShapeMeasurementAppearance,
  style: Style,
): ShapeMeasurementLayout | null {
  if (geometry.kind !== 'poly' || !geometry.points.length) return null;
  const angle = geomRotation(geometry);
  const localPoints = geometry.points.map((point) => rotatePoint(point, ORIGIN, -angle));
  const center =
    shapeCaptionPoint(appearance) ??
    rotatePoint(automaticShapeCaptionCenter(localPoints, geometry.closed), ORIGIN, angle);
  const text = shapeMeasurementLabel(geometry, appearance);
  const width = distanceCaptionWidth(text);
  const height = DISTANCE_CAPTION_SIZE;
  const along = rotatePoint({ x: 1, y: 0 }, ORIGIN, angle);
  const normal = { x: along.y, y: -along.x };
  const corner = (x: number, y: number): Point => ({
    x: center.x + x * along.x + y * normal.x,
    y: center.y + x * along.y + y * normal.y,
  });
  const caption: DistanceCaptionLayout | null =
    appearance.caption.enabled && text
      ? {
          text,
          center,
          along,
          normal,
          width,
          height,
          bounds: [
            corner(-width / 2, -height / 2),
            corner(width / 2, -height / 2),
            corner(width / 2, height / 2),
            corner(-width / 2, height / 2),
          ],
        }
      : null;
  const selectionPoints = [
    ...selectionQuad(geometry, style.strokeWidth, style.border),
    ...(caption?.bounds ?? []),
  ];
  return { caption, selectionPoints, visualBounds: unionRect(selectionPoints) };
}

export function measurementLayout(
  geometry: ContentGeometry,
  appearance: MeasurementAppearance,
  style: Style,
) {
  return appearance.intent === 'LineDimension'
    ? distanceLayout(geometry, appearance, style.strokeWidth)
    : shapeMeasurementLayout(geometry, appearance, style);
}

export function measurementSelectionQuad(
  geometry: ContentGeometry,
  appearance: MeasurementAppearance,
  style: Style,
): Quad {
  if (appearance.intent === 'LineDimension') {
    return distanceSelectionQuad(geometry, appearance, style.strokeWidth);
  }
  const layout = shapeMeasurementLayout(geometry, appearance, style);
  if (!layout) return selectionQuad(geometry, style.strokeWidth, style.border);
  const angle = geomRotation(geometry);
  const bounds = unionRect(
    layout.selectionPoints.map((point) => rotatePoint(point, ORIGIN, -angle)),
  );
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => rotatePoint(point, ORIGIN, angle)) as Quad;
}

export function moveMeasurementCaption(
  geometry: ContentGeometry,
  appearance: MeasurementAppearance,
  delta: Point,
  style: Style,
): MeasurementAppearance {
  if (appearance.intent === 'LineDimension')
    return moveDistanceCaption(geometry, appearance, delta);
  const center = shapeMeasurementLayout(geometry, appearance, style)?.caption?.center;
  return center
    ? withShapeCaptionPoint(appearance, { x: center.x + delta.x, y: center.y + delta.y })
    : appearance;
}
