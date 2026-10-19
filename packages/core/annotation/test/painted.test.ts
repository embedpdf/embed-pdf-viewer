import { describe, expect, it } from 'vitest';

import { bodyPieces, paintedNear, paintedTouches, type PaintedPiece } from '../src/painted';
import type { Point, Rect } from '../src/types';

const rectAt = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

// A line from (0,0) to (100,0), 2 wide.
const LINE: PaintedPiece = {
  kind: 'stroke',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  closed: false,
  halfWidth: 1,
};

// An L-shaped (concave) polygon: the notch is x 50..100, y 50..100.
const ELL: PaintedPiece = {
  kind: 'area',
  ring: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 100 },
  ],
};

const oval = (filled: boolean, rotation = 0): PaintedPiece => ({
  kind: 'oval',
  center: { x: 0, y: 0 },
  rx: 50,
  ry: 20,
  rotation,
  halfWidth: 2,
  filled,
});

describe('a stroke', () => {
  it('is near a point within half its width and the margin', () => {
    expect(paintedNear([LINE], { x: 50, y: 2.5 }, 1.5)).toBe(true);
    expect(paintedNear([LINE], { x: 50, y: 2.5 }, 1)).toBe(false);
  });

  it('is touched by a rect that crosses it, reaches its ink, or holds it; not by one beside it', () => {
    expect(paintedTouches([LINE], rectAt(40, -10, 5, 20))).toBe(true);
    expect(paintedTouches([LINE], rectAt(40, 0.5, 5, 5))).toBe(true);
    expect(paintedTouches([LINE], rectAt(-10, -10, 200, 20))).toBe(true);
    expect(paintedTouches([LINE], rectAt(40, 1.5, 5, 5))).toBe(false);
    expect(paintedTouches([LINE], rectAt(101.5, -5, 5, 10))).toBe(false);
  });

  it('closed, runs back to its first point', () => {
    const open: PaintedPiece = {
      kind: 'stroke',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      closed: false,
      halfWidth: 0,
    };
    const closed: PaintedPiece = { ...open, closed: true };
    const onClosingSide = rectAt(48, 48, 4, 4);
    expect(paintedTouches([open], onClosingSide)).toBe(false);
    expect(paintedTouches([closed], onClosingSide)).toBe(true);
  });
});

describe('an area', () => {
  it('is near a point inside it, whatever the margin, and not outside it', () => {
    expect(paintedNear([ELL], { x: 25, y: 75 }, 0)).toBe(true);
    expect(paintedNear([ELL], { x: 75, y: 75 }, 30)).toBe(false);
  });

  it('is touched by a rect it holds, one that holds it, or one across its edge; not one in its notch', () => {
    expect(paintedTouches([ELL], rectAt(10, 10, 5, 5))).toBe(true);
    expect(paintedTouches([ELL], rectAt(-10, -10, 200, 200))).toBe(true);
    expect(paintedTouches([ELL], rectAt(45, 60, 10, 5))).toBe(true);
    expect(paintedTouches([ELL], rectAt(60, 60, 30, 30))).toBe(false);
  });
});

describe('an oval', () => {
  it('unfilled, is its ink: a rect in its empty middle misses, one across its ink touches', () => {
    expect(paintedTouches([oval(false)], rectAt(-10, -5, 20, 10))).toBe(false);
    expect(paintedTouches([oval(false)], rectAt(40, -5, 20, 10))).toBe(true);
    expect(paintedTouches([oval(false)], rectAt(-100, -100, 200, 200))).toBe(true);
  });

  it('filled, is its inside too', () => {
    expect(paintedTouches([oval(true)], rectAt(-10, -5, 20, 10))).toBe(true);
    expect(paintedNear([oval(true)], { x: 0, y: 0 }, 0)).toBe(true);
  });

  it('turned, is where the turn puts it', () => {
    // Turned 90°: the long axis runs up and down.
    expect(paintedNear([oval(false, 90)], { x: 0, y: 50 }, 0)).toBe(true);
    expect(paintedNear([oval(false, 90)], { x: 50, y: 0 }, 0)).toBe(false);
    expect(paintedTouches([oval(false, 90)], rectAt(-5, 45, 10, 10))).toBe(true);
    expect(paintedTouches([oval(false, 90)], rectAt(45, -5, 10, 10))).toBe(false);
  });
});

describe('a body', () => {
  const body = bodyPieces([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]);

  it('is hit anywhere inside, and within the margin of its edge, corners rounded', () => {
    expect(paintedNear(body, { x: 5, y: 5 }, 0)).toBe(true);
    expect(paintedNear(body, { x: 12, y: 5 }, 2)).toBe(true);
    expect(paintedNear(body, { x: 11.5, y: 11.5 }, 2)).toBe(false);
  });
});

describe('a click and a rect of no size agree', () => {
  // A small deterministic generator, so a failure repeats.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pieces: PaintedPiece[][] = [
    [LINE],
    [ELL],
    [oval(false)],
    [oval(true)],
    [oval(false, 30)],
    bodyPieces([
      { x: 0, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 50 },
    ]),
  ];

  it.each(pieces.map((piece, i) => [i, piece] as const))('pieces %i', (_i, piece) => {
    for (let n = 0; n < 4000; n++) {
      const point: Point = { x: random() * 240 - 120, y: random() * 240 - 120 };
      const zero = rectAt(point.x, point.y, 0, 0);
      expect(paintedTouches(piece, zero)).toBe(paintedNear(piece, point, 0));
    }
  });
});
