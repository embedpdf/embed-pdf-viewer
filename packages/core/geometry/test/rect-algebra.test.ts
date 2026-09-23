import { describe, expect, it } from 'vitest';

import { rectContains, rectFromCorners, rectsOverlap } from '../src/index';
import { edgesOfQuad, edgesOverlap } from '../src/page-space';

describe('rect algebra (y-down rects)', () => {
  it('spans two corners in any order', () => {
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({
      x: 4,
      y: 2,
      width: 6,
      height: 18,
    });
  });

  it('contains points on its edges and rejects those outside', () => {
    const rect = { x: 0, y: 0, width: 10, height: 5 };
    expect(rectContains(rect, { x: 10, y: 5 })).toBe(true);
    expect(rectContains(rect, { x: 10.1, y: 5 })).toBe(false);
  });

  it('overlaps only with positive area', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(rect, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
    expect(rectsOverlap(rect, { x: 10, y: 0, width: 5, height: 5 })).toBe(false); // abutting
  });
});

describe('PDF edges (y-up)', () => {
  it('overlap only with positive area — the collateral rule', () => {
    const edges = { left: 0, bottom: 0, right: 10, top: 10 };
    expect(edgesOverlap(edges, { left: 9, bottom: 9, right: 20, top: 20 })).toBe(true);
    expect(edgesOverlap(edges, { left: 10, bottom: 0, right: 20, top: 10 })).toBe(false);
  });

  it('encloses a quad in its axis-aligned edges', () => {
    const quad = { p1: { x: 1, y: 8 }, p2: { x: 9, y: 9 }, p3: { x: 2, y: 1 }, p4: { x: 8, y: 2 } };
    expect(edgesOfQuad(quad)).toEqual({ left: 1, right: 9, bottom: 1, top: 9 });
  });
});
