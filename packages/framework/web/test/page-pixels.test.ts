import { describe, expect, it } from 'vitest';

import { isUprightQuad, quadInPixels, rectInPixels, svgPoints } from '../src/page-pixels';

/** A page drawn at 2 px per point, shifted by (10, 20). */
const page = {
  toPixels: (point: { x: number; y: number }) => ({ x: point.x * 2 + 10, y: point.y * 2 + 20 }),
};

const quad = {
  upperLeft: { x: 1, y: 1 },
  upperRight: { x: 5, y: 1 },
  lowerRight: { x: 5, y: 3 },
  lowerLeft: { x: 1, y: 3 },
};

describe('page pixels', () => {
  it('places a page box through the page transform', () => {
    expect(rectInPixels({ x: 1, y: 2, width: 3, height: 4 }, page)).toEqual({
      left: 12,
      top: 24,
      width: 6,
      height: 8,
    });
  });

  it('maps a quad corner by corner, in drawing order, and writes SVG points', () => {
    const points = quadInPixels(quad, page);
    expect(points).toEqual([
      { x: 12, y: 22 },
      { x: 20, y: 22 },
      { x: 20, y: 26 },
      { x: 12, y: 26 },
    ]);
    expect(svgPoints(points)).toBe('12,22 20,22 20,26 12,26');
  });

  it('tells an upright quad from a turned one', () => {
    expect(isUprightQuad(quad)).toBe(true);
    expect(isUprightQuad({ ...quad, upperRight: { x: 5, y: 1.5 } })).toBe(false);
    expect(isUprightQuad({ ...quad, lowerLeft: { x: 1.5, y: 3 } })).toBe(false);
  });
});
