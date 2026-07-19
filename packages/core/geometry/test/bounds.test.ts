import { describe, expect, it } from 'vitest';
import { boundsOfRects } from '../src/index';

describe('boundsOfRects', () => {
  it('returns null for the empty set', () => {
    expect(boundsOfRects([])).toBe(null);
  });

  it('returns a single rect unchanged (by value)', () => {
    const r = { x: 5, y: 10, width: 20, height: 30 };
    expect(boundsOfRects([r])).toEqual(r);
  });

  it('unions disjoint rects into their bounding box', () => {
    expect(
      boundsOfRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 30, y: 40, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 40, height: 50 });
  });

  it('handles containment and negative coordinates', () => {
    expect(
      boundsOfRects([
        { x: -10, y: -5, width: 100, height: 50 },
        { x: 0, y: 0, width: 10, height: 10 },
      ]),
    ).toEqual({ x: -10, y: -5, width: 100, height: 50 });
  });

  it('spans multi-line hit rects (the search navigation case)', () => {
    expect(
      boundsOfRects([
        { x: 200, y: 100, width: 150, height: 12 }, // line 1 tail
        { x: 40, y: 114, width: 90, height: 12 }, // line 2 head
      ]),
    ).toEqual({ x: 40, y: 100, width: 310, height: 26 });
  });
});
