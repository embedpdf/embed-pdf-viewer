/**
 * Line endings (/LE) — the arrowheads and tip shapes drawn at the ends of line
 * and polyline annotations. One spec per ending kind drives both the rendered
 * geometry (`endingNodes`) and the bounding-box points (`endingPoints`), so the
 * visual and the engine `/Rect` can never drift. Pure content-space math (PDF
 * points, y-down) — no DOM, no SVG strings — so it ports to Rust like the rest.
 *
 * Convention: each spec is authored in a local frame with the tip at the origin
 * and the body pointing back along −X. `endingNodes`/`endingPoints` rotate it by
 * the segment angle (into the tip) and translate it to the tip point. Sizes
 * scale with the stroke width.
 */
import type { LineEnding, RenderNode, Point } from './types';

interface EndingSpec {
  shape: 'poly' | 'ellipse';
  /** Poly: closed path (so it fills with the annotation's fill colour) vs an open
   *  polyline that is stroke-only (open arrow / butt / slash). Ellipses are always
   *  closed. Fill colour is the renderer's job — the spec only states closed-ness. */
  closed: boolean;
  /** Final rotation (radians) given the segment angle pointing into the tip. */
  rotation: (angle: number) => number;
  /** Local-frame points (tip at origin, body along −X). */
  points: (sw: number) => Point[];
}

const arrow = (closed: boolean): EndingSpec => ({
  shape: 'poly',
  closed,
  rotation: (angle) => angle,
  points: (sw) => {
    const len = sw * 9;
    const wing = Math.PI / 6; // 30°
    const x = -len * Math.cos(wing);
    const y = len * Math.sin(wing);
    return closed
      ? [
          { x: 0, y: 0 },
          { x, y },
          { x, y: -y },
        ]
      : [
          { x, y },
          { x: 0, y: 0 },
          { x, y: -y },
        ];
  },
});

const lineCap = (factor: number, rotation: (angle: number) => number): EndingSpec => ({
  shape: 'poly',
  closed: false,
  rotation,
  points: (sw) => {
    const half = (sw * factor) / 2;
    return [
      { x: -half, y: 0 },
      { x: half, y: 0 },
    ];
  },
});

const ENDINGS: Partial<Record<LineEnding, EndingSpec>> = {
  'open-arrow': arrow(false),
  'closed-arrow': arrow(true),
  'r-open-arrow': { ...arrow(false), rotation: (angle) => angle + Math.PI },
  'r-closed-arrow': { ...arrow(true), rotation: (angle) => angle + Math.PI },
  circle: {
    shape: 'ellipse',
    closed: true,
    rotation: () => 0, // a circle reads the same at any angle
    points: (sw) => {
      const radius = (sw * 5) / 2;
      return [
        { x: -radius, y: -radius },
        { x: radius, y: radius },
      ];
    },
  },
  square: {
    shape: 'poly',
    closed: true,
    rotation: (angle) => angle,
    points: (sw) => {
      const halfSize = (sw * 6) / 2;
      return [
        { x: -halfSize, y: -halfSize },
        { x: halfSize, y: -halfSize },
        { x: halfSize, y: halfSize },
        { x: -halfSize, y: halfSize },
      ];
    },
  },
  diamond: {
    shape: 'poly',
    closed: true,
    rotation: (angle) => angle,
    points: (sw) => {
      const halfSize = (sw * 6) / 2;
      return [
        { x: halfSize, y: 0 },
        { x: 0, y: halfSize },
        { x: -halfSize, y: 0 },
        { x: 0, y: -halfSize },
      ];
    },
  },
  butt: lineCap(6, (angle) => angle + Math.PI / 2),
  slash: lineCap(18, (angle) => angle + Math.PI / 1.5),
};

const rotateTranslate = (point: Point, angle: number, tip: Point): Point => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: tip.x + point.x * cosine - point.y * sine,
    y: tip.y + point.x * sine + point.y * cosine,
  };
};

const specOf = (ending: LineEnding | undefined): EndingSpec | undefined =>
  ending && ending !== 'none' ? ENDINGS[ending] : undefined;

/** Content-space points contributed by an ending — for the visual bounding box. */
export function endingPoints(
  tip: Point,
  angle: number,
  ending: LineEnding | undefined,
  strokeWidth: number,
): Point[] {
  const spec = specOf(ending);
  if (!spec) return [];
  const rot = spec.rotation(angle);
  return spec.points(strokeWidth).map((point) => rotateTranslate(point, rot, tip));
}

/** Content-space render nodes for an ending — what the framework renderer draws. */
export function endingNodes(
  tip: Point,
  angle: number,
  ending: LineEnding | undefined,
  strokeWidth: number,
): RenderNode[] {
  const spec = specOf(ending);
  if (!spec) return [];
  const rot = spec.rotation(angle);
  const points = spec.points(strokeWidth).map((point) => rotateTranslate(point, rot, tip));
  if (spec.shape === 'ellipse') {
    const [point, oppositeCorner] = points;
    return [
      {
        kind: 'ellipse',
        rect: {
          x: Math.min(point.x, oppositeCorner.x),
          y: Math.min(point.y, oppositeCorner.y),
          width: Math.abs(oppositeCorner.x - point.x),
          height: Math.abs(oppositeCorner.y - point.y),
        },
      },
    ];
  }
  return [{ kind: 'poly', points, closed: spec.closed }];
}
