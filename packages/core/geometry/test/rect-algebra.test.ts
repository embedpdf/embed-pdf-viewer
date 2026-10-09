import { describe, expect, it } from 'vitest';

import { containedRect, rectContains, rectFromCorners, rectsOverlap } from '../src/index';

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

  it('contains a shape at its proportions, centred, as CSS object-fit does', () => {
    const box = { x: 10, y: 20, width: 100, height: 40 };
    // Wider box: full height, centred across.
    expect(containedRect({ width: 2, height: 2 }, box)).toEqual({
      x: 40,
      y: 20,
      width: 40,
      height: 40,
    });
    // Taller box: full width, centred down.
    expect(
      containedRect({ width: 50, height: 10 }, { x: 0, y: 0, width: 100, height: 100 }),
    ).toEqual({ x: 0, y: 40, width: 100, height: 20 });
    expect(containedRect({ width: 0, height: 5 }, box)).toBe(box);
  });
});
