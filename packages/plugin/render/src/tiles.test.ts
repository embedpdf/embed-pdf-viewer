import { describe, expect, it } from 'vitest';

import {
  inflateRect,
  regionCovered,
  snapToPyramid,
  tileEngineRect,
  tileGrid,
  tilePaintRect,
  tilesInRect,
} from './tiles';

// A US-Letter-ish page: 612×792pt. At scale 8 with 512px tiles the device
// space is 4896×6336 → 10×13 tiles, each spanning 64pt.
const PAGE = { width: 612, height: 792 };

describe('tile grid math (aligned ×2 pyramid)', () => {
  it('sizes the grid from device pixels at the level scale', () => {
    const grid = tileGrid(PAGE, 8, 512);
    expect(grid.cols).toBe(10);
    expect(grid.rows).toBe(13);
    // A tiny page still gets one tile.
    expect(tileGrid({ width: 10, height: 10 }, 1, 512)).toMatchObject({ cols: 1, rows: 1 });
  });

  it('tilesInRect clamps to the page and covers exactly the touched tiles', () => {
    const grid = tileGrid(PAGE, 8, 512);
    // 64pt tile span → a rect inside tile (1,1) only.
    expect(tilesInRect(grid, PAGE, { x: 70, y: 70, width: 50, height: 50 })).toEqual([
      { ix: 1, iy: 1 },
    ]);
    // Spanning a corner of four tiles.
    expect(tilesInRect(grid, PAGE, { x: 60, y: 60, width: 10, height: 10 })).toHaveLength(4);
    // Off-page rects clamp instead of minting phantom tiles.
    expect(tilesInRect(grid, PAGE, { x: -500, y: -500, width: 400, height: 400 })).toEqual([]);
    const all = tilesInRect(grid, PAGE, { x: -10, y: -10, width: 10_000, height: 10_000 });
    expect(all).toHaveLength(10 * 13);
  });

  it('paint rects are y-down points, edge tiles clipped to the page', () => {
    const grid = tileGrid(PAGE, 8, 512);
    expect(tilePaintRect(grid, PAGE, { ix: 0, iy: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
    // Right-edge column: 612 - 9×64 = 36pt wide.
    expect(tilePaintRect(grid, PAGE, { ix: 9, iy: 0 }).width).toBeCloseTo(36);
    // Bottom-edge row: 792 - 12×64 = 24pt tall.
    expect(tilePaintRect(grid, PAGE, { ix: 0, iy: 12 }).height).toBeCloseTo(24);
  });

  it('engine rects are the same tiles flipped to PDF y-up (top > bottom)', () => {
    const grid = tileGrid(PAGE, 8, 512);
    const rect = tileEngineRect(grid, PAGE, { ix: 0, iy: 0 });
    expect(rect).toEqual({ left: 0, right: 64, top: 792, bottom: 792 - 64 });
    expect(rect.top).toBeGreaterThan(rect.bottom);
  });

  it('regionCovered is index arithmetic over the want grid', () => {
    const grid = tileGrid(PAGE, 8, 512);
    const painted = new Set(['0,0', '1,0', '0,1']);
    const isPainted = (c: { ix: number; iy: number }) => painted.has(`${c.ix},${c.iy}`);
    // A region inside the painted L-shape: covered.
    expect(regionCovered(grid, PAGE, { x: 0, y: 0, width: 60, height: 60 }, isPainted)).toBe(true);
    // Extending into the unpainted (1,1): not covered.
    expect(regionCovered(grid, PAGE, { x: 0, y: 0, width: 120, height: 120 }, isPainted)).toBe(
      false,
    );
    // Empty regions are vacuously covered.
    expect(regionCovered(grid, PAGE, { x: 5, y: 5, width: 0, height: 0 }, isPainted)).toBe(true);
  });

  it('snapToPyramid snaps UP and caps at the top', () => {
    expect(snapToPyramid([1, 2, 4, 8], 3)).toBe(4);
    expect(snapToPyramid([1, 2, 4, 8], 8)).toBe(8);
    expect(snapToPyramid([1, 2, 4, 8], 50)).toBe(8);
    expect(snapToPyramid([8, 1, 4, 2], 3)).toBe(4); // unsorted input
  });

  it('inflateRect grows symmetrically, and velocity biases toward travel', () => {
    const r = { x: 100, y: 100, width: 100, height: 100 };
    expect(inflateRect(r, 0.5)).toEqual({ x: 50, y: 50, width: 200, height: 200 });
    const biased = inflateRect(r, 0.5, { dx: 0, dy: 120 });
    // Scrolling down: more coverage below, less above.
    expect(biased.y).toBe(75); // 25 above (half margin)
    expect(biased.y + biased.height).toBe(300); // 100 below (double margin)
  });
});
