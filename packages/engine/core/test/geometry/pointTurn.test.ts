import { describe, expect, it } from 'vitest';

import {
  pdfPointsBounds,
  pdfPointTurned,
  pdfPointUnturned,
  pdfTurnOfDrawn,
  pdfTurnOfUpright,
} from '../../src/geometry/pointTurn';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('turning points', () => {
  const upright = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 220, y: 180 },
  ];

  it('turns clockwise as the page shows it', () => {
    // A quarter turn clockwise takes a point right of the middle to below it.
    const turned = pdfPointTurned({ x: 10, y: 0 }, { degrees: 90, center: { x: 0, y: 0 } });
    close(turned, { x: 0, y: -10 });
  });

  it('turns about the middle of the upright box, and back', () => {
    const turn = pdfTurnOfUpright(upright, 30);
    expect(turn.center).toEqual({ x: 200, y: 140 });
    const drawn = upright.map((point) => pdfPointTurned(point, turn));
    drawn.forEach((point, i) => close(pdfPointUnturned(point, turn), upright[i]!));
  });

  it('finds the turn from the drawing alone', () => {
    for (const degrees of [30, 90, 145, 270, 333.3]) {
      const turn = pdfTurnOfUpright(upright, degrees);
      const drawn = upright.map((point) => pdfPointTurned(point, turn));
      const found = pdfTurnOfDrawn(drawn, degrees);
      close(found.center, turn.center);
      const back = drawn.map((point) => pdfPointUnturned(point, found));
      expect(pdfPointsBounds(back).left).toBeCloseTo(100, 9);
      expect(pdfPointsBounds(back).top).toBeCloseTo(180, 9);
    }
  });
});
