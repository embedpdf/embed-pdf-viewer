import { describe, expect, it } from 'vitest';

import { rectContains, rectFromCorners, rectsOverlap } from '../src/index';

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
