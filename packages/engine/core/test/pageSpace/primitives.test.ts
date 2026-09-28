import { describe, expect, test } from 'vitest';

import { normalizePdfRect } from '../../src/geometry/convert';
import {
  pageBoxOf,
  pagePointOf,
  pageQuadOf,
  pdfPointOf,
  pdfQuadOf,
  pdfRectOf,
} from '../../src/geometry/pageSpace';
import type { PdfRect } from '../../src/geometry/primitives';

/** A value as a file holds it: a 32-bit float. */
const f32 = (value: number) => Math.fround(value);

/** A small, repeatable random source. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const visibleBoxes: PdfRect[] = [
  { left: 0, bottom: 0, right: 612, top: 792 },
  { left: -306, bottom: -396, right: 306, top: 396 },
  { left: -1685, bottom: -1192, right: 1685, top: 1192 },
  { left: 50, bottom: 60, right: 562, top: 732 },
  { left: f32(12.345), bottom: f32(-7.25), right: f32(600.125), top: f32(781.5) },
];

describe('page space primitives', () => {
  test('measure from the top-left of the visible box, y down', () => {
    const visible = { left: 50, bottom: 60, right: 562, top: 732 };
    expect(pagePointOf({ x: 50, y: 732 }, visible)).toEqual({ x: 0, y: 0 });
    expect(pagePointOf({ x: 150, y: 632 }, visible)).toEqual({ x: 100, y: 100 });
    expect(pageBoxOf({ left: 100, bottom: 600, right: 150, top: 650 }, visible)).toEqual({
      x: 50,
      y: 82,
      width: 50,
      height: 50,
    });
  });

  test('a page-space rect in the file has its keys in normalizePdfRect order', () => {
    const rect = pdfRectOf({ x: 1, y: 2, width: 3, height: 4 }, visibleBoxes[0]!);
    expect(Object.keys(rect)).toEqual(Object.keys(normalizePdfRect(rect)));
  });

  test.each(visibleBoxes.map((visible, i) => [i, visible] as const))(
    'every value a file can hold comes back exactly (visible box %i)',
    (i, visible) => {
      const next = random(i + 1);
      const value = () => f32((next() - 0.5) * 20000);
      for (let n = 0; n < 2000; n++) {
        const point = { x: value(), y: value() };
        const back = pdfPointOf(pagePointOf(point, visible), visible);
        expect(Object.is(back.x, point.x) && Object.is(back.y, point.y)).toBe(true);

        const [a, b] = [value(), value()];
        const [c, d] = [value(), value()];
        const rect = {
          left: Math.min(a, b),
          bottom: Math.min(c, d),
          right: Math.max(a, b),
          top: Math.max(c, d),
        };
        expect(pdfRectOf(pageBoxOf(rect, visible), visible)).toEqual(normalizePdfRect(rect));

        const quad = { p1: point, p2: { x: a, y: c }, p3: { x: b, y: d }, p4: { x: a, y: d } };
        expect(pdfQuadOf(pageQuadOf(quad, visible), visible)).toEqual(quad);
      }
    },
  );
});
