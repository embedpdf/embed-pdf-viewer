import { describe, expect, it } from 'vitest';

import { normalizePdfQuad } from '../../src/geometry/convert';
import type { PdfQuad } from '../../src/geometry/primitives';

// An upright cell in PDF space: the upper edge has the larger y.
const upright: PdfQuad = {
  upperLeft: { x: 10, y: 32 },
  upperRight: { x: 40, y: 32 },
  lowerLeft: { x: 10, y: 20 },
  lowerRight: { x: 40, y: 20 },
};

describe('normalizePdfQuad', () => {
  it("keeps Acrobat's order", () => {
    const { upperLeft, upperRight, lowerLeft, lowerRight } = upright;
    expect(normalizePdfQuad([upperLeft, upperRight, lowerLeft, lowerRight])).toEqual(upright);
  });

  it("keeps a turned quad's names, even where they are not screen directions", () => {
    // Turned a quarter: the baseline runs up the page, the upper edge is on the left.
    const turned: PdfQuad = {
      upperLeft: { x: 38, y: 10 },
      upperRight: { x: 38, y: 40 },
      lowerLeft: { x: 50, y: 10 },
      lowerRight: { x: 50, y: 40 },
    };
    const { upperLeft, upperRight, lowerLeft, lowerRight } = turned;
    expect(normalizePdfQuad([upperLeft, upperRight, lowerLeft, lowerRight])).toEqual(turned);
  });

  it('repairs the ring order', () => {
    const { upperLeft, upperRight, lowerLeft, lowerRight } = upright;
    expect(normalizePdfQuad([upperLeft, upperRight, lowerRight, lowerLeft])).toEqual(upright);
  });

  it('names a crossed quad from its shape, the upper edge highest on the page', () => {
    const crossed = normalizePdfQuad([
      { x: 0, y: 0 },
      { x: 10, y: 12 },
      { x: 10, y: 0 },
      { x: 0, y: 12 },
    ]);
    expect(crossed).toEqual({
      upperLeft: { x: 0, y: 12 },
      upperRight: { x: 10, y: 12 },
      lowerLeft: { x: 0, y: 0 },
      lowerRight: { x: 10, y: 0 },
    });
  });

  it('never throws on a point that is not a number', () => {
    const quad = normalizePdfQuad([
      { x: Number.NaN, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 12 },
      { x: 10, y: 12 },
    ]);
    for (const point of Object.values(quad)) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
});
