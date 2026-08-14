import { describe, expect, test } from 'vitest';
import {
  applyTextQuad,
  normalizeQuad,
  positionalQuad,
  rotate,
  textQuadBounds,
  textQuadFromRect,
  textQuadRing,
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
