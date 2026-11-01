/**
 * Where pages dragged over the thumbnails land: next to the page nearest the pointer, left or
 * right of it in a row of several, above or below it in a single column; nowhere over a page
 * that moves, or in the place the pages already are. And Alt+arrows move the selection one place.
 */
import { describe, expect, it } from 'vitest';

import {
  columnsOf,
  slotMove,
  thumbDropAt,
  type ThumbBox,
} from '../../../chrome/src/ui/thumbnail-drop';

const SPACING = { gap: 16, band: 20 };

/** Pages 10, 20, 30, 40 in one column: each 100 × 140, 176 apart (page, band, gap). */
const COLUMN: ThumbBox[] = [10, 20, 30, 40].map((page, i) => ({
  page,
  x: 20,
  y: 16 + i * 176,
  width: 100,
  height: 140,
}));

/** The same pages two to a row: 10 and 20, then 30 and 40. */
const GRID: ThumbBox[] = [10, 20, 30, 40].map((page, i) => ({
  page,
  x: 16 + (i % 2) * 116,
  y: 16 + Math.floor(i / 2) * 176,
  width: 100,
  height: 140,
}));

const ORDER = [10, 20, 30, 40];

describe('thumbDropAt', () => {
  it('in a column, puts the pages above or below the page nearest the pointer', () => {
    const moving = new Set([10]);
    expect(thumbDropAt(COLUMN, { x: 70, y: 16 + 176 + 120 }, SPACING, ORDER, moving)).toEqual({
      position: { after: 20 },
      // Below the page and its number band, halfway into the gap.
      line: { x: 20, y: 16 + 176 + 140 + 20 + 8 - 1, width: 100, height: 2 },
    });
    expect(
      thumbDropAt(COLUMN, { x: 70, y: 16 + 352 + 10 }, SPACING, ORDER, moving)?.position,
    ).toEqual({ before: 30 });
  });

  it('in a row of several, puts them left or right of the page', () => {
    const drop = thumbDropAt(GRID, { x: 132 + 90, y: 60 }, SPACING, ORDER, new Set([40]));
    expect(drop).toEqual({
      position: { after: 20 },
      line: { x: 132 + 100 + 8 - 1, y: 16, width: 2, height: 140 },
    });
    expect(columnsOf(GRID)).toBe(2);
    expect(columnsOf(COLUMN)).toBe(1);
  });

  it('over a gap, takes the nearest page', () => {
    // Between 20's number band and 30, nearer 30.
    expect(
      thumbDropAt(COLUMN, { x: 70, y: 16 + 352 - 4 }, SPACING, ORDER, new Set([10]))?.position,
    ).toEqual({ before: 30 });
  });

  it('drops nowhere over a page that moves, or where the pages already are', () => {
    expect(thumbDropAt(COLUMN, { x: 70, y: 60 }, SPACING, ORDER, new Set([10]))).toBeNull();
    // 10 and 20 already come before 30.
    expect(
      thumbDropAt(COLUMN, { x: 70, y: 16 + 352 + 10 }, SPACING, ORDER, new Set([10, 20])),
    ).toBeNull();
    expect(thumbDropAt([], { x: 0, y: 0 }, SPACING, ORDER, new Set([10]))).toBeNull();
  });

  it('places files dropped from outside anywhere, next to any page', () => {
    expect(thumbDropAt(COLUMN, { x: 70, y: 60 }, SPACING, ORDER, new Set())?.position).toEqual({
      before: 10,
    });
  });
});

describe('slotMove', () => {
  it('moves the selection past the nearest page that is not selected', () => {
    expect(slotMove(ORDER, new Set([20, 30]), -1)).toEqual({ before: 10 });
    expect(slotMove(ORDER, new Set([20, 30]), 1)).toEqual({ after: 40 });
    expect(slotMove(ORDER, new Set([10]), -1)).toBeNull();
    expect(slotMove(ORDER, new Set([40]), 1)).toBeNull();
    expect(slotMove(ORDER, new Set(), 1)).toBeNull();
  });
});
