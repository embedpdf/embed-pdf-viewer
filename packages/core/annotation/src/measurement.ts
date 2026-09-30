import { isReadout, measurementReadout } from '@embedpdf/engine-core/runtime';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { endingNodes, endingNodesHit, endingPoints } from './endings';
import { DISTANCE_CAPTION_SIZE as CAPTION_SIZE, distanceCaptionWidth } from './measurement-font';
import { geomRotation, selectionQuad } from './geometry';
import { dashOf } from './kinds/styles';
import { rotatePoint, segDist, unionRect } from './rect';
import { drawnLineOf, strokedOutlineOf } from './shapes/points';
import type {
  FieldValues,
  Shape,
  Handle,
  Paint,
  QuadRing,
  Rect,
  RenderNode,
  SceneNode,
  Style,
  Point,
} from './types';
import type { ShapeMeasurementAppearance } from './measurement-shape';

export type MeasurementAppearance = DistanceAppearance | ShapeMeasurementAppearance;

type LineAnnotation = Extract<AnnotationDTO, { subtype: 'line' }>;

/**
 * A distance's measurement: the engine's own fields for its scale, its
 * caption (on or off, its position, and its offset in the line's own axes),
 * its leader and its label (`contents`, which the engine works out).
 */
export type DistanceAppearance = { intent: 'line-dimension' } & Pick<
  LineAnnotation,
  'measure' | 'captionEnabled' | 'captionPosition' | 'captionOffset' | 'leader' | 'contents'
>;

/**
 * The annotation's measurement, when it is one: a line measuring a
 * distance, a polyline a perimeter, a polygon an area, as its intent says.
 * Its measurement fields, read off it for drawing and hit-testing.
 */
export function measurementOf(annotation: AnnotationDTO): MeasurementAppearance | undefined {
  if (annotation.subtype === 'line' && annotation.intent === 'line-dimension') {
    return {
      intent: annotation.intent,
      measure: annotation.measure,
      captionEnabled: annotation.captionEnabled,
      captionPosition: annotation.captionPosition,
      captionOffset: annotation.captionOffset,
      leader: annotation.leader,
      contents: annotation.contents,
    };
  }
  if (
    (annotation.subtype === 'polyline' || annotation.subtype === 'polygon') &&
    (annotation.intent === 'polyline-dimension' || annotation.intent === 'polygon-dimension')
  ) {
    return {
      intent: annotation.intent,
      measure: annotation.measure,
      captionEnabled: annotation.captionEnabled,
      contents: annotation.contents,
    };
  }
  return undefined;
}

/** The subject a measurement is named by, as Acrobat names it. */
const SUBJECT = {
  'line-dimension': 'Distance',
  'polyline-dimension': 'Perimeter',
  'polygon-dimension': 'Area',
} as const;

/**
 * What a new measurement states beside its points: its intent, its scale
 * (one the engine can write), its caption and leader as it has them, and its
 * subject. Its label is the engine's: it works it out from the points and
 * the scale.
 */
export function measurementDraftFields(appearance: MeasurementAppearance): FieldValues {
  const caption =
    appearance.intent === 'line-dimension'
      ? {
          captionEnabled: appearance.captionEnabled,
          captionPosition: appearance.captionPosition,
          captionOffset: appearance.captionOffset,
          leader: appearance.leader,
        }
      : { captionEnabled: appearance.captionEnabled };
  return {
    intent: appearance.intent,
    measure: appearance.measure?.subtype === 'rectilinear' ? appearance.measure : null,
    ...Object.fromEntries(Object.entries(caption).filter(([, value]) => value !== undefined)),
    subject: SUBJECT[appearance.intent],
  };
}

type CaptionOffset = DistanceAppearance['captionOffset'];

export interface DistanceSegment {
  from: Point;
  to: Point;
}

export interface DistanceCaptionLayout {
  text: string;
  center: Point;
  along: Point;
  normal: Point;
  width: number;
  height: number;
  bounds: QuadRing;
}

/** One layout drives the preview, selection, handles, and hit testing. */
export interface DistanceLayout {
  along: Point;
  normal: Point;
  length: number;
  measuredStart: Point;
  measuredEnd: Point;
  dimensionStart: Point;
  dimensionEnd: Point;
  dimensionSegments: DistanceSegment[];
  leaderSegments: DistanceSegment[];
  captionConnector: DistanceSegment[];
  caption: DistanceCaptionLayout | null;
  arrowPlacement: 'inside' | 'outside';
  endings: RenderNode[];
  selectionPoints: Point[];
  visualBounds: Rect;
}

const CAPTION_PADDING = 2;
const OUTSIDE_CAPTION_PADDING = 7;
const ARROW_RESERVE = 24;
const OUTSIDE_STUB_LENGTH = 20;

function offsetPoint(point: Point, direction: Point, distance: number): Point {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  };
}

function projectDelta(from: Point, to: Point, direction: Point): number {
  return (to.x - from.x) * direction.x + (to.y - from.y) * direction.y;
}

function lineAxes(start: Point, end: Point) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const along =
    length > 0 ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : { x: 1, y: 0 };

  // PDF's +90° normal, expressed in content coordinates (y down).
  const normal = { x: along.y, y: -along.x };

  return { along, normal, length };
}

export function distanceLabel(geometry: Shape, appearance: DistanceAppearance): string {
  if (geometry.kind !== 'line') {
    return appearance.contents ?? '';
  }

  const readout = measurementReadout({
    subtype: 'line',
    intent: appearance.intent,
    measure: appearance.measure,
    linePoints: geometry.linePoints,
  });

  return isReadout(readout) ? readout.label : (appearance.contents ?? '');
}

function captionQuad(
  center: Point,
  along: Point,
  normal: Point,
  width: number,
  height: number,
): QuadRing {
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
  midpoint: Point,
  caption: DistanceCaptionLayout,
  along: Point,
  normal: Point,
  offset: CaptionOffset,
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
  start: Point,
  end: Point,
  along: Point,
  normal: Point,
  length: number,
  caption: DistanceCaptionLayout | null,
  position: DistanceAppearance['captionPosition'],
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
  geometry: Shape,
  appearance: DistanceAppearance,
  strokeWidth: number,
): DistanceLayout | null {
  if (geometry.kind !== 'line') {
    return null;
  }

  const { start: a, end: b } = drawnLineOf(geometry);
  const { along, normal, length } = lineAxes(a, b);
  const leaderLength = appearance.leader?.length ?? 0;
  const dimensionStart = offsetPoint(a, normal, leaderLength);
  const dimensionEnd = offsetPoint(b, normal, leaderLength);
  const midpoint = offsetPoint(dimensionStart, along, length / 2);
  const text = distanceLabel(geometry, appearance);
  const width = distanceCaptionWidth(text);
  const hasCaption = !!appearance.captionEnabled && text.length > 0;
  // A documented fit policy, constrained by the Acrobat 1.75 m / 2.01 m cases.
  const outside = hasCaption && width + 2 * CAPTION_PADDING + ARROW_RESERVE * strokeWidth > length;

  let caption: DistanceCaptionLayout | null = null;
  if (hasCaption) {
    const reversed = along.x < 0 || (along.x === 0 && along.y > 0);
    const textAlong = reversed ? { x: -along.x, y: -along.y } : along;
    const textNormal = { x: textAlong.y, y: -textAlong.x };
    const offset = appearance.captionOffset;
    let center = offsetPoint(midpoint, along, offset?.along ?? 0);
    center = offsetPoint(center, normal, offset?.perpendicular ?? 0);

    if (appearance.captionPosition === 'top' || outside) {
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

    for (const endpoint of [a, b]) {
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
    appearance.captionPosition,
    outside,
    strokeWidth,
  );
  const connector = caption
    ? captionConnector(midpoint, caption, along, normal, appearance.captionOffset)
    : [];

  const angle = Math.atan2(along.y, along.x);
  const startAngle = outside ? angle : angle + Math.PI;
  const endAngle = outside ? angle + Math.PI : angle;
  const endings = [
    ...endingNodes(dimensionStart, startAngle, geometry.lineEndings?.start, strokeWidth),
    ...endingNodes(dimensionEnd, endAngle, geometry.lineEndings?.end, strokeWidth),
  ];
  const boundsPoints = [
    a,
    b,
    ...segments.flatMap((segment) => [segment.from, segment.to]),
    ...leaderSegments.flatMap((segment) => [segment.from, segment.to]),
    ...connector.flatMap((segment) => [segment.from, segment.to]),
    ...endingPoints(dimensionStart, startAngle, geometry.lineEndings?.start, strokeWidth),
    ...endingPoints(dimensionEnd, endAngle, geometry.lineEndings?.end, strokeWidth),
    ...(caption?.bounds ?? []),
  ];

  return {
    along,
    normal,
    length,
    measuredStart: a,
    measuredEnd: b,
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
  geometry: Shape,
  appearance: DistanceAppearance,
  strokeWidth: number,
): QuadRing {
  const layout = distanceLayout(geometry, appearance, strokeWidth);
  if (!layout || geometry.kind !== 'line') {
    return selectionQuad(geometry, { strokeWidth: strokeWidth });
  }

  // The line's own frame is its turn. Include every measurement component
  // before constructing that frame, then rotate its corners back. Reboxing the
  // page-aligned bounds would grow and shift the selection as the annotation
  // turns.
  const angle = geomRotation(geometry);
  const origin = drawnLineOf(geometry).start;
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
  point: Point,
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
  point: Point,
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

  const tolerance = margin + strokeWidth / 2;
  return (
    segments.some((segment) => segDist(point, segment.from, segment.to) <= tolerance) ||
    endingNodesHit(layout.endings, point, tolerance)
  );
}

export function distanceCaptionAt(
  geometry: Shape,
  appearance: DistanceAppearance,
  width: number,
): Point | null {
  return distanceLayout(geometry, appearance, width)?.caption?.center ?? null;
}

export function distanceLeaderLength(geometry: Shape, point: Point): number {
  if (geometry.kind !== 'line') {
    return 0;
  }

  const { start, end } = drawnLineOf(geometry);
  const { normal } = lineAxes(start, end);
  return projectDelta(start, point, normal);
}

export function moveDistanceCaption(
  geometry: Shape,
  appearance: DistanceAppearance,
  delta: Point,
): DistanceAppearance {
  if (geometry.kind !== 'line') {
    return appearance;
  }

  const { start, end } = drawnLineOf(geometry);
  const { along, normal } = lineAxes(start, end);
  const previous = appearance.captionOffset;

  return {
    ...appearance,
    captionOffset: {
      along: (previous?.along ?? 0) + delta.x * along.x + delta.y * along.y,
      perpendicular: (previous?.perpendicular ?? 0) + delta.x * normal.x + delta.y * normal.y,
    },
  };
}

/**
 * The upright box around all a distance paints: its dimension line, leader
 * and connector lines and its endings stroked at `strokeWidth` (what
 * `distanceScene` draws), and its caption's box.
 */
export function distanceDrawnBounds(layout: DistanceLayout, strokeWidth: number): Rect {
  const lines = [
    ...layout.dimensionSegments,
    ...layout.leaderSegments,
    ...layout.captionConnector,
  ].map((segment): RenderNode => ({ kind: 'line', a: segment.from, b: segment.to }));
  return unionRect([
    ...strokedOutlineOf([...lines, ...layout.endings], strokeWidth),
    ...(layout.caption?.bounds ?? []),
  ]);
}

export function distanceScene(
  geometry: Shape,
  appearance: DistanceAppearance,
  style: Style,
): SceneNode[] {
  const layout = distanceLayout(geometry, appearance, style.strokeWidth);
  if (!layout) {
    return [];
  }

  const paint: Paint = {
    stroke: style.color,
    width: style.strokeWidth,
    opacity: style.opacity,
    dash: dashOf(style),
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
