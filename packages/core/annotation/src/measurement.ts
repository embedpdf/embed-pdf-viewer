import { isReadout, measurementReadout } from '@embedpdf/engine-core/runtime';
import type {
  LineDimensionCaption,
  LineLeader,
  PdfMeasurement,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { endingNodes, endingPoints } from './endings';
import { DISTANCE_CAPTION_SIZE as CAPTION_SIZE, distanceCaptionWidth } from './measurement-font';
import { geomHit, geomRotation, rotatePoint, selectionQuad, unionRect } from './geometry';
import type { Geom, Handle, Paint, Quad, Rect, RenderNode, SceneNode, Style, Vec } from './types';
import type { ShapeMeasurementAppearance } from './measurement-shape';

export type MeasurementAppearance = DistanceAppearance | ShapeMeasurementAppearance;

/**
 * A distance annotation's render projection. Offsets stay in directed PDF line
 * axes. The crop keeps numeric rounding in the original PDF coordinate frame.
 */
export interface DistanceAppearance {
  intent: 'LineDimension';
  measure: PdfMeasurement | null;
  caption: LineDimensionCaption;
  leader?: LineLeader;
  crop: PdfRect;
  text: string;
}

export interface DistanceSegment {
  from: Vec;
  to: Vec;
}

export interface DistanceCaptionLayout {
  text: string;
  center: Vec;
  along: Vec;
  normal: Vec;
  width: number;
  height: number;
  bounds: Quad;
}

/** One layout drives the preview, selection, handles, and hit testing. */
export interface DistanceLayout {
  along: Vec;
  normal: Vec;
  length: number;
  measuredStart: Vec;
  measuredEnd: Vec;
  dimensionStart: Vec;
  dimensionEnd: Vec;
  dimensionSegments: DistanceSegment[];
  leaderSegments: DistanceSegment[];
  captionConnector: DistanceSegment[];
  caption: DistanceCaptionLayout | null;
  arrowPlacement: 'inside' | 'outside';
  endings: RenderNode[];
  selectionPoints: Vec[];
  visualBounds: Rect;
}

const CAPTION_PADDING = 2;
const OUTSIDE_CAPTION_PADDING = 7;
const ARROW_RESERVE = 24;
const OUTSIDE_STUB_LENGTH = 20;

function offsetPoint(point: Vec, direction: Vec, distance: number): Vec {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  };
}

function projectDelta(from: Vec, to: Vec, direction: Vec): number {
  return (to.x - from.x) * direction.x + (to.y - from.y) * direction.y;
}

function lineAxes(start: Vec, end: Vec) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const along =
    length > 0 ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : { x: 1, y: 0 };

  // PDF's +90° normal, expressed in content coordinates (y down).
  const normal = { x: along.y, y: -along.x };

  return { along, normal, length };
}

export function distanceLabel(geom: Geom, appearance: DistanceAppearance): string {
  if (geom.t !== 'line') {
    return appearance.text;
  }

  const toPdfPoint = (point: Vec) => ({
    x: point.x + appearance.crop.left,
    y: appearance.crop.top - point.y,
  });

  const readout = measurementReadout({
    subtype: 'line',
    intent: appearance.intent,
    measure: appearance.measure,
    linePoints: {
      start: toPdfPoint(geom.a),
      end: toPdfPoint(geom.b),
    },
  });

  return isReadout(readout) ? readout.label : appearance.text;
}

function captionQuad(center: Vec, along: Vec, normal: Vec, width: number, height: number): Quad {
  const corner = (x: number, y: number) => offsetPoint(offsetPoint(center, along, x), normal, y);

  return [
    corner(-width / 2, -height / 2),
    corner(width / 2, -height / 2),
    corner(width / 2, height / 2),
    corner(-width / 2, height / 2),
  ];
}

/** A displaced caption connects to the midpoint, stopping clear of its text. */
function captionConnector(
  midpoint: Vec,
  caption: DistanceCaptionLayout,
  along: Vec,
  normal: Vec,
  offset: LineDimensionCaption['offset'],
): DistanceSegment[] {
  if (!offset || (offset.along === 0 && offset.perpendicular === 0)) {
    return [];
  }

  const perpendicular = projectDelta(midpoint, caption.center, normal);
  const horizontal = projectDelta(midpoint, caption.center, along);
  const halfWidth = caption.width / 2 + CAPTION_PADDING;
  const halfHeight = caption.height / 2 + CAPTION_PADDING;

  if (Math.abs(perpendicular) <= halfHeight) {
    return [];
  }

  if (Math.abs(horizontal) <= halfWidth) {
    const to = offsetPoint(midpoint, normal, perpendicular - Math.sign(perpendicular) * halfHeight);
    return [{ from: midpoint, to }];
  }

  const knee = offsetPoint(midpoint, normal, perpendicular);
  const to = offsetPoint(caption.center, along, -Math.sign(horizontal) * halfWidth);

  return [
    { from: midpoint, to: knee },
    { from: knee, to },
  ];
}

function dimensionSegments(
  start: Vec,
  end: Vec,
  along: Vec,
  normal: Vec,
  length: number,
  caption: DistanceCaptionLayout | null,
  position: LineDimensionCaption['position'],
  outside: boolean,
  strokeWidth: number,
): DistanceSegment[] {
  if (outside) {
    const stubLength = OUTSIDE_STUB_LENGTH * strokeWidth;
    return [
      { from: offsetPoint(start, along, -stubLength), to: start },
      { from: end, to: offsetPoint(end, along, stubLength) },
    ];
  }

  if (!caption || position === 'top') {
    return [{ from: start, to: end }];
  }

  const perpendicular = projectDelta(start, caption.center, normal);
  if (Math.abs(perpendicular) >= caption.height / 2 + CAPTION_PADDING) {
    return [{ from: start, to: end }];
  }

  const at = projectDelta(start, caption.center, along);
  const halfGap = caption.width / 2 + CAPTION_PADDING;
  const gapStart = Math.max(0, Math.min(length, at - halfGap));
  const gapEnd = Math.max(0, Math.min(length, at + halfGap));
  const segments: DistanceSegment[] = [];

  if (gapStart > 0) {
    segments.push({ from: start, to: offsetPoint(start, along, gapStart) });
  }
  if (gapEnd < length) {
    segments.push({ from: offsetPoint(start, along, gapEnd), to: end });
  }

  return segments;
}

export function distanceLayout(
  geom: Geom,
  appearance: DistanceAppearance,
  strokeWidth: number,
): DistanceLayout | null {
  if (geom.t !== 'line') {
    return null;
  }

  const { along, normal, length } = lineAxes(geom.a, geom.b);
  const leaderLength = appearance.leader?.length ?? 0;
  const dimensionStart = offsetPoint(geom.a, normal, leaderLength);
  const dimensionEnd = offsetPoint(geom.b, normal, leaderLength);
  const midpoint = offsetPoint(dimensionStart, along, length / 2);
  const text = distanceLabel(geom, appearance);
  const width = distanceCaptionWidth(text);
  const hasCaption = appearance.caption.enabled && text.length > 0;
  // A documented fit policy, constrained by the Acrobat 1.75 m / 2.01 m cases.
  const outside = hasCaption && width + 2 * CAPTION_PADDING + ARROW_RESERVE * strokeWidth > length;

  let caption: DistanceCaptionLayout | null = null;
  if (hasCaption) {
    const reversed = along.x < 0 || (along.x === 0 && along.y > 0);
    const textAlong = reversed ? { x: -along.x, y: -along.y } : along;
    const textNormal = { x: textAlong.y, y: -textAlong.x };
    const offset = appearance.caption.offset;
    let center = offsetPoint(midpoint, along, offset?.along ?? 0);
    center = offsetPoint(center, normal, offset?.perpendicular ?? 0);

    if (appearance.caption.position === 'top' || outside) {
      const side = outside && leaderLength < 0 ? -1 : 1;
      const padding = outside ? OUTSIDE_CAPTION_PADDING : CAPTION_PADDING;
      // The anchor follows the directed line when it rotates. Only the glyph
      // orientation flips for readability; that must not move the caption.
      center = offsetPoint(center, normal, side * (CAPTION_SIZE / 2 + padding));
    }

    caption = {
      text,
      center,
      along: textAlong,
      normal: textNormal,
      width,
      height: CAPTION_SIZE,
      bounds: captionQuad(center, textAlong, textNormal, width, CAPTION_SIZE),
    };
  }

  const leaderSegments: DistanceSegment[] = [];
  if (leaderLength !== 0) {
    const side = Math.sign(leaderLength);
    const leaderOffset = side * (appearance.leader?.offset ?? 0);
    const leaderEnd = leaderLength + side * (appearance.leader?.extension ?? 0);

    for (const endpoint of [geom.a, geom.b]) {
      leaderSegments.push({
        from: offsetPoint(endpoint, normal, leaderOffset),
        to: offsetPoint(endpoint, normal, leaderEnd),
      });
    }
  }

  const segments = dimensionSegments(
    dimensionStart,
    dimensionEnd,
    along,
    normal,
    length,
    caption,
    appearance.caption.position,
    outside,
    strokeWidth,
  );
  const connector = caption
    ? captionConnector(midpoint, caption, along, normal, appearance.caption.offset)
    : [];

  const angle = Math.atan2(along.y, along.x);
  const startAngle = outside ? angle : angle + Math.PI;
  const endAngle = outside ? angle + Math.PI : angle;
  const endings = [
    ...endingNodes(dimensionStart, startAngle, geom.ends?.start, strokeWidth),
    ...endingNodes(dimensionEnd, endAngle, geom.ends?.end, strokeWidth),
  ];
  const boundsPoints = [
    geom.a,
    geom.b,
    ...segments.flatMap((segment) => [segment.from, segment.to]),
    ...leaderSegments.flatMap((segment) => [segment.from, segment.to]),
    ...connector.flatMap((segment) => [segment.from, segment.to]),
    ...endingPoints(dimensionStart, startAngle, geom.ends?.start, strokeWidth),
    ...endingPoints(dimensionEnd, endAngle, geom.ends?.end, strokeWidth),
    ...(caption?.bounds ?? []),
  ];

  return {
    along,
    normal,
    length,
    measuredStart: geom.a,
    measuredEnd: geom.b,
    dimensionStart,
    dimensionEnd,
    dimensionSegments: segments,
    leaderSegments,
    captionConnector: connector,
    caption,
    arrowPlacement: outside ? 'outside' : 'inside',
    endings,
    selectionPoints: boundsPoints,
    visualBounds: expandDistanceBounds(unionRect(boundsPoints), strokeWidth / 2 + 1),
  };
}

export function expandDistanceBounds(bounds: Rect, padding: number): Rect {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + 2 * padding,
    height: bounds.height + 2 * padding,
  };
}

export function distanceSelectionQuad(
  geom: Geom,
  appearance: DistanceAppearance,
  strokeWidth: number,
): Quad {
  const layout = distanceLayout(geom, appearance, strokeWidth);
  if (!layout || geom.t !== 'line') {
    return selectionQuad(geom, strokeWidth);
  }

  // Vertex annotations recover their local frame using the advisory rotation.
  // Include every measurement component before constructing that frame, then
  // rotate its corners back. Reboxing the page-aligned bounds would grow and
  // shift the selection as the annotation turns.
  const angle = geomRotation(geom);
  const origin = geom.a;
  const points = layout.selectionPoints.map((point) => rotatePoint(point, origin, -angle));
  const bounds = expandDistanceBounds(unionRect(points), strokeWidth / 2 + 1);
  const corner = (x: number, y: number) => rotatePoint({ x, y }, origin, angle);

  return [
    corner(bounds.x, bounds.y),
    corner(bounds.x + bounds.width, bounds.y),
    corner(bounds.x + bounds.width, bounds.y + bounds.height),
    corner(bounds.x, bounds.y + bounds.height),
  ];
}

export function distanceHandles(layout: DistanceLayout): Handle[] {
  return [
    { id: 'v0', at: layout.measuredStart, cursor: 'crosshair' },
    { id: 'v1', at: layout.measuredEnd, cursor: 'crosshair' },
    { id: 'leader-start', at: layout.dimensionStart, cursor: 'move' },
    { id: 'leader-end', at: layout.dimensionEnd, cursor: 'move' },
  ];
}

export function distanceCaptionHit(
  layout: { caption: DistanceCaptionLayout | null },
  point: Vec,
  margin = 0,
): boolean {
  const caption = layout.caption;
  if (!caption) {
    return false;
  }

  const along = projectDelta(caption.center, point, caption.along);
  const perpendicular = projectDelta(caption.center, point, caption.normal);

  return (
    Math.abs(along) <= caption.width / 2 + margin &&
    Math.abs(perpendicular) <= caption.height / 2 + margin
  );
}

export function distanceHit(
  layout: DistanceLayout,
  point: Vec,
  strokeWidth: number,
  margin: number,
): boolean {
  if (distanceCaptionHit(layout, point, margin)) {
    return true;
  }

  const segments = [
    ...layout.dimensionSegments,
    ...layout.leaderSegments,
    ...layout.captionConnector,
  ];

  return (
    segments.some((segment) =>
      geomHit({ t: 'line', a: segment.from, b: segment.to }, point, margin, false, strokeWidth),
    ) ||
    layout.endings.some((ending) => {
      if (ending.kind === 'poly') {
        return geomHit(
          { t: 'poly', points: ending.points, closed: ending.closed },
          point,
          margin,
          true,
          strokeWidth,
        );
      }
      if (ending.kind === 'ellipse') {
        return geomHit(
          { t: 'rect', rect: ending.rect, ellipse: true },
          point,
          margin,
          true,
          strokeWidth,
        );
      }
      return false;
    })
  );
}

export function distanceCaptionAt(
  geom: Geom,
  appearance: DistanceAppearance,
  width: number,
): Vec | null {
  return distanceLayout(geom, appearance, width)?.caption?.center ?? null;
}

export function distanceLeaderLength(geom: Geom, point: Vec): number {
  if (geom.t !== 'line') {
    return 0;
  }

  const { normal } = lineAxes(geom.a, geom.b);
  return projectDelta(geom.a, point, normal);
}

export function moveDistanceCaption(
  geom: Geom,
  appearance: DistanceAppearance,
  delta: Vec,
): DistanceAppearance {
  if (geom.t !== 'line') {
    return appearance;
  }

  const { along, normal } = lineAxes(geom.a, geom.b);
  const previous = appearance.caption.offset;

  return {
    ...appearance,
    caption: {
      ...appearance.caption,
      offset: {
        along: (previous?.along ?? 0) + delta.x * along.x + delta.y * along.y,
        perpendicular: (previous?.perpendicular ?? 0) + delta.x * normal.x + delta.y * normal.y,
      },
    },
  };
}

export function distanceScene(
  geom: Geom,
  appearance: DistanceAppearance,
  style: Style,
): SceneNode[] {
  const layout = distanceLayout(geom, appearance, style.strokeWidth);
  if (!layout) {
    return [];
  }

  const paint: Paint = {
    stroke: style.color,
    width: style.strokeWidth,
    opacity: style.opacity,
    dash: style.border.kind === 'dashed' ? style.border.dash : undefined,
  };
  const segments = [
    ...layout.dimensionSegments,
    ...layout.leaderSegments,
    ...layout.captionConnector,
  ];
  const nodes: SceneNode[] = segments.map((segment) => ({
    kind: 'line',
    a: segment.from,
    b: segment.to,
    paint,
  }));

  for (const ending of layout.endings) {
    const filled = ending.kind === 'ellipse' || (ending.kind === 'poly' && ending.closed);
    nodes.push({
      ...ending,
      paint: {
        ...paint,
        fill: filled ? (style.interiorColor ?? undefined) : undefined,
      },
    } as SceneNode);
  }

  nodes.push(...measurementCaptionScene(layout.caption, style));

  return nodes;
}

export function measurementCaptionScene(
  caption: DistanceCaptionLayout | null,
  style: Style,
): SceneNode[] {
  if (caption) {
    const baseline = offsetPoint(caption.center, caption.normal, -CAPTION_SIZE * 0.33);
    const at = offsetPoint(baseline, caption.along, -caption.width / 2);

    return [
      {
        kind: 'text',
        at,
        text: caption.text,
        fontSize: CAPTION_SIZE,
        fontFamily: 'Helvetica, Arial, sans-serif',
        rotation: (Math.atan2(caption.along.y, caption.along.x) * 180) / Math.PI,
        paint: { fill: '#000000', opacity: style.opacity },
      },
    ];
  }
  return [];
}
