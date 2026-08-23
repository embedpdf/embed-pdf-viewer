import { describe, expect, test } from 'vitest';
import {
  applyTextQuad,
  normalizeQuad,
  positionalQuad,
  rotate,
  rotateAbout,
  textQuadBounds,
  textQuadEdge,
  textQuadEquals,
  textQuadFromRect,
  textQuadRing,
  type Point,
  type PointIn,
  type Quad,
  type TextQuad,
  type TextQuadIn,
} from '../src/index';

const rect = { x: 10, y: 20, width: 30, height: 12 };

describe('TextQuad', () => {
  test('rect round-trip: fromRect → positional → normalize is identity', () => {
    const t = textQuadFromRect(rect);
    expect(t.upperStart).toEqual({ x: 10, y: 20 });
    expect(t.lowerEnd).toEqual({ x: 40, y: 32 });
    const back = normalizeQuad(positionalQuad(t));
    expect(back).toEqual(t);
  });

  test('bounds and ring', () => {
    const t = textQuadFromRect(rect);
    expect(textQuadBounds(t)).toEqual(rect);
    expect(textQuadRing(t)).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 32 },
      { x: 10, y: 32 },
    ]);
  });

  test('normalizeQuad passes well-formed rotated zigzag through untouched', () => {
    // 90°-rotated cell: baseline runs down-screen; upper edge on the +x side.
    const q: Quad = {
      p1: { x: 50, y: 10 }, // upper-start
      p2: { x: 50, y: 40 }, // upper-end
      p3: { x: 38, y: 10 }, // lower-start
      p4: { x: 38, y: 40 }, // lower-end
    };
    const t = normalizeQuad(q);
    expect(t.upperStart).toEqual(q.p1);
    expect(t.upperEnd).toEqual(q.p2);
    expect(t.lowerStart).toEqual(q.p3);
    expect(t.lowerEnd).toEqual(q.p4);
  });

  test('normalizeQuad repairs ring-order producers (US, UE, LE, LS)', () => {
    const t0 = textQuadFromRect(rect);
    const ringOrder: Quad = {
      p1: t0.upperStart,
      p2: t0.upperEnd,
      p3: t0.lowerEnd, // ring order puts LE in the LS slot
      p4: t0.lowerStart,
    };
    expect(normalizeQuad(ringOrder)).toEqual(t0);
  });

  test('normalizeQuad gives garbage a deterministic upper-on-top labeling', () => {
    // Self-intersecting order that neither interpretation accepts.
    const garbage: Quad = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 12 },
      p3: { x: 10, y: 0 },
      p4: { x: 0, y: 12 },
    };
    const t = normalizeQuad(garbage);
    // Deterministic, and "upper" lands on the smaller-y edge.
    const upperMidY = (t.upperStart.y + t.upperEnd.y) / 2;
    const lowerMidY = (t.lowerStart.y + t.lowerEnd.y) / 2;
    expect(upperMidY).toBeLessThan(lowerMidY);
    expect(normalizeQuad(garbage)).toEqual(t);
  });

  test('applyTextQuad carries corner semantics through a rotation', () => {
    const t = textQuadFromRect({ x: 0, y: 0, width: 10, height: 4 }) as TextQuadIn<'content'>;
    const turned = applyTextQuad(rotate<'content'>(Math.PI / 2), t);
    // Corner NAMES stay attached to the same text corners regardless of
    // where the transform puts them on screen.
    expect(turned.upperStart.x).toBeCloseTo(0, 6);
    expect(turned.upperStart.y).toBeCloseTo(0, 6);
    expect(turned.upperEnd.x).toBeCloseTo(0, 6);
    expect(turned.upperEnd.y).toBeCloseTo(10, 6);
    const expected: TextQuad = turned;
    expect(textQuadBounds(expected).width).toBeCloseTo(4, 6);
    expect(textQuadBounds(expected).height).toBeCloseTo(10, 6);
  });
});

describe('textQuadEdge', () => {
  const cell = textQuadFromRect({ x: 100, y: 200, width: 60, height: 16 });

  test('upright: the side edges ARE the rect sides, ascent corner first', () => {
    expect(textQuadEdge(cell, 'start')).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 216 },
    ]);
    expect(textQuadEdge(cell, 'end')).toEqual([
      { x: 160, y: 200 },
      { x: 160, y: 216 },
    ]);
  });

  test('length is the INK height, invariant under rotation (the AABB is not)', () => {
    const len = (e: [Point, Point]) => Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
    expect(len(textQuadEdge(cell, 'start'))).toBeCloseTo(16, 9);
    for (const deg of [30, 45, 90, 180, 270]) {
      const turned = applyTextQuad(
        rotate<'content'>((deg * Math.PI) / 180),
        cell as TextQuadIn<'content'>,
      );
      expect(len(textQuadEdge(turned, 'start'))).toBeCloseTo(16, 9);
      expect(len(textQuadEdge(turned, 'end'))).toBeCloseTo(16, 9);
    }
    // …while the AABB height balloons with tilt — why it cannot size a caret
    const tilted = applyTextQuad(rotate<'content'>(Math.PI / 4), cell as TextQuadIn<'content'>);
    expect(textQuadBounds(tilted).height).toBeCloseTo(76 / Math.SQRT2, 6);
  });

  test('direction carries the text rotation', () => {
    const angle = (e: [Point, Point]) =>
      (Math.atan2(e[1].y - e[0].y, e[1].x - e[0].x) * 180) / Math.PI;
    expect(angle(textQuadEdge(cell, 'start'))).toBeCloseTo(90, 9); // straight down
    const turned = applyTextQuad(rotate<'content'>(Math.PI / 4), cell as TextQuadIn<'content'>);
    expect(angle(textQuadEdge(turned, 'start'))).toBeCloseTo(135, 9);
  });

  test('the two edges are parallel and span the cell', () => {
    const turned = applyTextQuad(rotate<'content'>(0.7), cell as TextQuadIn<'content'>);
    const [us, ls] = textQuadEdge(turned, 'start');
    const [ue, le] = textQuadEdge(turned, 'end');
    // parallel: the cross product of the two edge vectors vanishes
    const cross =
      (ls.x - us.x) * (le.y - ue.y) - (ls.y - us.y) * (le.x - ue.x);
    expect(cross).toBeCloseTo(0, 9);
    // and they are the advance-width apart
    expect(Math.hypot(ue.x - us.x, ue.y - us.y)).toBeCloseTo(60, 9);
  });
});

describe('textQuadEquals', () => {
  const cell = textQuadFromRect({ x: 100, y: 200, width: 60, height: 16 });

  test('identical corners are equal; any moved corner is not', () => {
    expect(textQuadEquals(cell, textQuadFromRect({ x: 100, y: 200, width: 60, height: 16 }))).toBe(
      true,
    );
    expect(textQuadEquals(cell, { ...cell, lowerEnd: { x: 161, y: 216 } })).toBe(false);
  });

  test('a rotation-in-place with a near-identical AABB still reads as a change', () => {
    // rotate about the cell centre: the AABB stays centred (and for a square
    // cell would be IDENTICAL) while every corner moves — the case handle
    // re-rendering must catch
    const c = { x: 130, y: 208 };
    const turned = applyTextQuad(
      rotateAbout<'content'>(c as PointIn<'content'>, Math.PI / 6),
      cell as TextQuadIn<'content'>,
    );
    expect(textQuadEquals(cell, turned)).toBe(false);
  });
});
