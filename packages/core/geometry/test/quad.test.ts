import { describe, expect, test } from 'vitest';
import {
  applyQuad,
  quadBounds,
  quadCorners,
  quadEdge,
  quadEquals,
  quadFromRect,
  quadRing,
  rotate,
  rotateAbout,
  type Point,
  type PointIn,
  type Quad,
  type QuadIn,
} from '../src/index';

const rect = { x: 10, y: 20, width: 30, height: 12 };

describe('Quad', () => {
  test('an upright quad over a rect has its upper edge at the smaller y', () => {
    const quad = quadFromRect(rect);
    expect(quadCorners(quad)).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 10, y: 32 },
      { x: 40, y: 32 },
    ]);
  });

  test('bounds and ring', () => {
    const quad = quadFromRect(rect);
    expect(quadBounds(quad)).toEqual(rect);
    expect(quadRing(quad)).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 32 },
      { x: 10, y: 32 },
    ]);
  });

  test('applyQuad carries corner semantics through a rotation', () => {
    const upright = quadFromRect({ x: 0, y: 0, width: 10, height: 4 }) as QuadIn<'page'>;
    const turned = applyQuad(rotate<'page'>(Math.PI / 2), upright);
    // Corner names stay attached to the same text corners regardless of
    // where the transform puts them on screen.
    expect(turned.upperLeft.x).toBeCloseTo(0, 6);
    expect(turned.upperLeft.y).toBeCloseTo(0, 6);
    expect(turned.upperRight.x).toBeCloseTo(0, 6);
    expect(turned.upperRight.y).toBeCloseTo(10, 6);
    const expected: Quad = turned;
    expect(quadBounds(expected).width).toBeCloseTo(4, 6);
    expect(quadBounds(expected).height).toBeCloseTo(10, 6);
  });
});

describe('quadEdge', () => {
  const cell = quadFromRect({ x: 100, y: 200, width: 60, height: 16 });

  test('upright: the side edges ARE the rect sides, ascent corner first', () => {
    expect(quadEdge(cell, 'left')).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 216 },
    ]);
    expect(quadEdge(cell, 'right')).toEqual([
      { x: 160, y: 200 },
      { x: 160, y: 216 },
    ]);
  });

  test('length is the INK height, invariant under rotation (the AABB is not)', () => {
    const len = (edge: [Point, Point]) => Math.hypot(edge[1].x - edge[0].x, edge[1].y - edge[0].y);
    expect(len(quadEdge(cell, 'left'))).toBeCloseTo(16, 9);
    for (const deg of [30, 45, 90, 180, 270]) {
      const turned = applyQuad(rotate<'page'>((deg * Math.PI) / 180), cell as QuadIn<'page'>);
      expect(len(quadEdge(turned, 'left'))).toBeCloseTo(16, 9);
      expect(len(quadEdge(turned, 'right'))).toBeCloseTo(16, 9);
    }
    // …while the AABB height balloons with tilt — why it cannot size a caret
    const tilted = applyQuad(rotate<'page'>(Math.PI / 4), cell as QuadIn<'page'>);
    expect(quadBounds(tilted).height).toBeCloseTo(76 / Math.SQRT2, 6);
  });

  test('direction carries the text rotation', () => {
    const angle = (edge: [Point, Point]) =>
      (Math.atan2(edge[1].y - edge[0].y, edge[1].x - edge[0].x) * 180) / Math.PI;
    expect(angle(quadEdge(cell, 'left'))).toBeCloseTo(90, 9); // straight down
    const turned = applyQuad(rotate<'page'>(Math.PI / 4), cell as QuadIn<'page'>);
    expect(angle(quadEdge(turned, 'left'))).toBeCloseTo(135, 9);
  });

  test('the two edges are parallel and span the cell', () => {
    const turned = applyQuad(rotate<'page'>(0.7), cell as QuadIn<'page'>);
    const [ul, ll] = quadEdge(turned, 'left');
    const [ur, lr] = quadEdge(turned, 'right');
    // parallel: the cross product of the two edge vectors vanishes
    const cross = (ll.x - ul.x) * (lr.y - ur.y) - (ll.y - ul.y) * (lr.x - ur.x);
    expect(cross).toBeCloseTo(0, 9);
    // and they are the advance-width apart
    expect(Math.hypot(ur.x - ul.x, ur.y - ul.y)).toBeCloseTo(60, 9);
  });
});

describe('quadEquals', () => {
  const cell = quadFromRect({ x: 100, y: 200, width: 60, height: 16 });

  test('identical corners are equal; any moved corner is not', () => {
    expect(quadEquals(cell, quadFromRect({ x: 100, y: 200, width: 60, height: 16 }))).toBe(true);
    expect(quadEquals(cell, { ...cell, lowerRight: { x: 161, y: 216 } })).toBe(false);
  });

  test('a rotation-in-place with a near-identical AABB still reads as a change', () => {
    // rotate about the cell centre: the AABB stays centred (and for a square
    // cell would be identical) while every corner moves — the case handle
    // re-rendering must catch
    const center = { x: 130, y: 208 };
    const turned = applyQuad(
      rotateAbout<'page'>(center as PointIn<'page'>, Math.PI / 6),
      cell as QuadIn<'page'>,
    );
    expect(quadEquals(cell, turned)).toBe(false);
  });
});
