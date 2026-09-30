import { isReadout, measurementReadout } from '@embedpdf/engine-core/runtime';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { geomRotation, selectionQuad } from './geometry';
import { pointInPoly, rotatePoint, unionRect } from './rect';
import { drawnPointOf, drawnVerticesOf, uprightPointOf } from './shapes/points';
import { DISTANCE_CAPTION_SIZE, distanceCaptionWidth } from './measurement-font';
import { distanceLayout, distanceSelectionQuad, moveDistanceCaption } from './measurement';
import type { DistanceCaptionLayout, MeasurementAppearance } from './measurement';
import type { Shape, QuadRing, Rect, Style, Point } from './types';

type ShapeAnnotation = Extract<AnnotationDTO, { subtype: 'polygon' | 'polyline' }>;

/**
 * A perimeter's or area's measurement: the engine's own fields for its scale,
 * whether its caption shows, and its label (`contents`, which the engine
 * works out). Where the caption sits is the shape's `captionCenter`.
 */
export type ShapeMeasurementAppearance = {
  intent: 'polyline-dimension' | 'polygon-dimension';
} & Pick<ShapeAnnotation, 'measure' | 'captionEnabled' | 'contents'>;

export interface ShapeMeasurementLayout {
  caption: DistanceCaptionLayout | null;
  visualBounds: Rect;
  selectionPoints: Point[];
}

const ORIGIN = { x: 0, y: 0 };

export function shapeMeasurementReadout(geometry: Shape, appearance: ShapeMeasurementAppearance) {
  return measurementReadout({
    subtype: appearance.intent === 'polygon-dimension' ? 'polygon' : 'polyline',
    intent: appearance.intent,
    measure: appearance.measure,
    vertices: geometry.kind === 'poly' ? geometry.vertices : [],
  });
}

export function shapeMeasurementLabel(
  geometry: Shape,
  appearance: ShapeMeasurementAppearance,
): string {
  const readout = shapeMeasurementReadout(geometry, appearance);
  if (isReadout(readout)) return readout.label;
  return readout.unavailable === 'invalid-geometry' ? '—' : (appearance.contents ?? '');
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
  geometry: Shape,
  appearance: ShapeMeasurementAppearance,
  style: Style,
): ShapeMeasurementLayout | null {
  if (geometry.kind !== 'poly' || !geometry.vertices.length) return null;
  const angle = geomRotation(geometry);
  const localPoints = drawnVerticesOf(geometry).map((point) => rotatePoint(point, ORIGIN, -angle));
  const center = geometry.captionCenter
    ? drawnPointOf(geometry, geometry.captionCenter)
    : rotatePoint(automaticShapeCaptionCenter(localPoints, geometry.closed), ORIGIN, angle);
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
    appearance.captionEnabled && text
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
  const selectionPoints = [...selectionQuad(geometry, style), ...(caption?.bounds ?? [])];
  return { caption, selectionPoints, visualBounds: unionRect(selectionPoints) };
}

export function measurementLayout(
  geometry: Shape,
  appearance: MeasurementAppearance,
  style: Style,
) {
  return appearance.intent === 'line-dimension'
    ? distanceLayout(geometry, appearance, style.strokeWidth)
    : shapeMeasurementLayout(geometry, appearance, style);
}

export function measurementSelectionQuad(
  geometry: Shape,
  appearance: MeasurementAppearance,
  style: Style,
): QuadRing {
  if (appearance.intent === 'line-dimension') {
    return distanceSelectionQuad(geometry, appearance, style.strokeWidth);
  }
  const layout = shapeMeasurementLayout(geometry, appearance, style);
  if (!layout) return selectionQuad(geometry, style);
  const angle = geomRotation(geometry);
  const bounds = unionRect(
    layout.selectionPoints.map((point) => rotatePoint(point, ORIGIN, -angle)),
  );
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => rotatePoint(point, ORIGIN, angle)) as QuadRing;
}

/**
 * The caption dragged by `delta`: a distance's caption offset changes (its
 * measurement), a perimeter's or area's caption center (its shape, kept
 * upright with the vertices).
 */
export function moveMeasurementCaption(
  geometry: Shape,
  appearance: MeasurementAppearance,
  delta: Point,
  style: Style,
): { geometry: Shape; measure: MeasurementAppearance } {
  if (appearance.intent === 'line-dimension')
    return { geometry, measure: moveDistanceCaption(geometry, appearance, delta) };
  const center = shapeMeasurementLayout(geometry, appearance, style)?.caption?.center;
  if (!center || geometry.kind !== 'poly') return { geometry, measure: appearance };
  const moved = { x: center.x + delta.x, y: center.y + delta.y };
  return {
    geometry: { ...geometry, captionCenter: uprightPointOf(geometry, moved) },
    measure: appearance,
  };
}
