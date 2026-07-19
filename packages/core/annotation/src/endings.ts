/**
 * Line endings (/LE) — the arrowheads and tip shapes drawn at the ends of line
 * and polyline annotations. ONE spec per ending kind drives BOTH the rendered
 * geometry (`endingNodes`) and the bounding-box points (`endingPoints`), so the
 * visual and the engine `/Rect` can never drift. Pure content-space math (PDF
 * points, y-down) — no DOM, no SVG strings — so it ports to Rust like the rest.
 *
 * Convention: each spec is authored in a LOCAL frame with the tip at the origin
 * and the body pointing back along −X. `endingNodes`/`endingPoints` rotate it by
 * the segment angle (into the tip) and translate it to the tip point. Sizes
 * scale with the stroke width, matching the v2 renderer.
 */
import type { LineEnding, RenderNode, Vec } from './types';

interface EndingSpec {
  shape: 'poly' | 'ellipse';
  /** Poly: closed path (so it fills with the annotation's fill colour) vs an open
   *  polyline that is stroke-only (open arrow / butt / slash). Ellipses are always
   *  closed. Fill colour is the renderer's job — the spec only states closed-ness. */
  closed: boolean;
  /** Final rotation (radians) given the segment angle pointing INTO the tip. */
  rotation: (angle: number) => number;
  /** Local-frame points (tip at origin, body along −X). */
  points: (sw: number) => Vec[];
}

const arrow = (closed: boolean): EndingSpec => ({
  shape: 'poly',
  closed,
  rotation: (a) => a,
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

const lineCap = (factor: number, rotation: (a: number) => number): EndingSpec => ({
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
  'r-open-arrow': { ...arrow(false), rotation: (a) => a + Math.PI },
  'r-closed-arrow': { ...arrow(true), rotation: (a) => a + Math.PI },
  circle: {
    shape: 'ellipse',
    closed: true,
    rotation: () => 0, // a circle reads the same at any angle
    points: (sw) => {
      const r = (sw * 5) / 2;
      return [
        { x: -r, y: -r },
        { x: r, y: r },
      ];
    },
  },
  square: {
    shape: 'poly',
    closed: true,
    rotation: (a) => a,
    points: (sw) => {
      const h = (sw * 6) / 2;
      return [
        { x: -h, y: -h },
        { x: h, y: -h },
        { x: h, y: h },
        { x: -h, y: h },
      ];
    },
  },
  diamond: {
    shape: 'poly',
    closed: true,
    rotation: (a) => a,
    points: (sw) => {
      const h = (sw * 6) / 2;
      return [
        { x: h, y: 0 },
        { x: 0, y: h },
        { x: -h, y: 0 },
        { x: 0, y: -h },
      ];
    },
  },
  butt: lineCap(6, (a) => a + Math.PI / 2),
  slash: lineCap(18, (a) => a + Math.PI / 1.5),
};

const rotateTranslate = (p: Vec, angle: number, tip: Vec): Vec => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: tip.x + p.x * c - p.y * s, y: tip.y + p.x * s + p.y * c };
};

const specOf = (ending: LineEnding | undefined): EndingSpec | undefined =>
  ending && ending !== 'none' ? ENDINGS[ending] : undefined;

/** Content-space points contributed by an ending — for the visual bounding box. */
export function endingPoints(
  tip: Vec,
  angle: number,
  ending: LineEnding | undefined,
  strokeWidth: number,
): Vec[] {
  const spec = specOf(ending);
  if (!spec) return [];
  const rot = spec.rotation(angle);
  return spec.points(strokeWidth).map((p) => rotateTranslate(p, rot, tip));
}

/** Content-space render nodes for an ending — what the framework renderer draws. */
export function endingNodes(
  tip: Vec,
  angle: number,
  ending: LineEnding | undefined,
  strokeWidth: number,
): RenderNode[] {
  const spec = specOf(ending);
  if (!spec) return [];
  const rot = spec.rotation(angle);
  const pts = spec.points(strokeWidth).map((p) => rotateTranslate(p, rot, tip));
  if (spec.shape === 'ellipse') {
    const [a, b] = pts;
    return [
      {
        kind: 'ellipse',
        rect: {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x),
          height: Math.abs(b.y - a.y),
        },
      },
    ];
  }
  return [{ kind: 'poly', points: pts, closed: spec.closed }];
}
