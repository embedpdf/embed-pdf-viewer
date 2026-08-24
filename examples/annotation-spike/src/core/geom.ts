/**
 * Pure geometry helpers over the unit shape. Every annotation is a UNIT shape
 * (square spanning [-0.5, 0.5]², or unit circle r = 0.5) placed by a Mat2D.
 * Move/resize/rotate are all "left/right-multiply a matrix" — see update.ts.
 */
import { Mat2D, Pt, apply, compose, scale, translate } from './mat2d';

export type HandleRole = 'nw' | 'ne' | 'se' | 'sw';

export const LOCAL: Record<HandleRole, Pt> = {
  nw: { x: -0.5, y: -0.5 },
  ne: { x: 0.5, y: -0.5 },
  se: { x: 0.5, y: 0.5 },
  sw: { x: -0.5, y: 0.5 },
};
export const OPPOSITE: Record<HandleRole, HandleRole> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };
export const ROLES: HandleRole[] = ['nw', 'ne', 'se', 'sw'];
export const CORNERS: Pt[] = [LOCAL.nw, LOCAL.ne, LOCAL.se, LOCAL.sw];

/** The rotate knob floats below the shape's bottom edge by default (clears the top menu). */
export const KNOB_LOCAL: Pt = { x: 0, y: 0.85 };
export const KNOB_STEM_LOCAL: Pt = { x: 0, y: 0.5 };

/** Map a drag rect (two page points) to the transform that places the unit shape there. */
export function rectToTransform(p1: Pt, p2: Pt): Mat2D {
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const w = Math.abs(p2.x - p1.x) || 1;
  const h = Math.abs(p2.y - p1.y) || 1;
  return compose(translate(cx, cy), scale(w, h));
}

export interface Bounds {
  min: Pt;
  max: Pt;
}

/** An alignment guide. axis 'x' = a vertical line at x=`at`, spanning y in [lo,hi]; 'y' = horizontal. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  lo: number;
  hi: number;
}

/** Axis-aligned page-space bounds of a placed unit shape (its 4 transformed corners). */
export function boundsOf(t: Mat2D): Bounds {
  let min = { x: Infinity, y: Infinity };
  let max = { x: -Infinity, y: -Infinity };
  for (const c of CORNERS) {
    const p = apply(t, c);
    min = { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y) };
    max = { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y) };
  }
  return { min, max };
}

export const rectOf = (a: Pt, b: Pt): Bounds => ({
  min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
  max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
});

export const intersects = (a: Bounds, b: Bounds): boolean =>
  a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;

export function unionBounds(list: Bounds[]): Bounds {
  let min = { x: Infinity, y: Infinity };
  let max = { x: -Infinity, y: -Infinity };
  for (const b of list) {
    min = { x: Math.min(min.x, b.min.x), y: Math.min(min.y, b.min.y) };
    max = { x: Math.max(max.x, b.max.x), y: Math.max(max.y, b.max.y) };
  }
  return { min, max };
}

export const center = (b: Bounds): Pt => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
});
