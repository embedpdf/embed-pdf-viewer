import type { PdfRect } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

// One owner for space math: rect intersection lives in core-geometry
// (the stage's visibility computation uses the same helper).
export { intersectRects } from '@embedpdf/core-geometry';

/**
 * Pure tile-grid math (SCALE-OUT §2.1e).
 *
 * The pyramid is ALIGNED: one origin (the page's top-left), a fixed tile
 * size in device pixels, and ×2 scale steps. Alignment is what makes the
 * retention bookkeeping index arithmetic instead of rectangle geometry —
 * a level-s tile is covered by exactly the level-2s tiles whose indices
 * fall in its doubled range, so occlusion/release checks are O(1).
 *
 * Spaces: tile COORDS live on the device grid at their level's scale
 * (tileSize² device px per tile, constant per-job cost by construction);
 * PAINT rects are y-down page points (the viewer convention — the layer
 * multiplies by one container transform); ENGINE rects are y-up PDF user
 * space (the `target: {kind:'rect'}` contract).
 */

export interface PageSizePt {
  width: number;
  height: number;
}

export interface TileCoord {
  ix: number;
  iy: number;
}

export interface TileGrid {
  /** Device px per PDF point at this pyramid level. */
  scale: number;
  /** Tile edge in device px. */
  tileSize: number;
  cols: number;
  rows: number;
}

export function tileGrid(page: PageSizePt, scale: number, tileSize: number): TileGrid {
  return {
    scale,
    tileSize,
    cols: Math.max(1, Math.ceil((page.width * scale) / tileSize)),
    rows: Math.max(1, Math.ceil((page.height * scale) / tileSize)),
  };
}

/** One tile's edge in page points at its level. */
const tileSpanPt = (grid: TileGrid): number => grid.tileSize / grid.scale;

/**
 * The tiles of `grid` intersecting a y-down page-point rect, clamped to
 * the page. An empty intersection yields an empty list.
 */
export function tilesInRect(grid: TileGrid, page: PageSizePt, rect: Rect): TileCoord[] {
  const span = tileSpanPt(grid);
  const x0 = Math.max(0, Math.floor(rect.x / span));
  const y0 = Math.max(0, Math.floor(rect.y / span));
  const x1 = Math.min(grid.cols - 1, Math.ceil((rect.x + rect.width) / span) - 1);
  const y1 = Math.min(grid.rows - 1, Math.ceil((rect.y + rect.height) / span) - 1);
  const out: TileCoord[] = [];
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) out.push({ ix, iy });
  }
  return out;
}

/** Paint rect: y-down page points, clamped to the page edge. */
export function tilePaintRect(grid: TileGrid, page: PageSizePt, c: TileCoord): Rect {
  const span = tileSpanPt(grid);
  const x = c.ix * span;
  const y = c.iy * span;
  return {
    x,
    y,
    width: Math.min(span, page.width - x),
    height: Math.min(span, page.height - y),
  };
}

/** Engine target rect: y-UP PDF user space (top > bottom). */
export function tileEngineRect(grid: TileGrid, page: PageSizePt, c: TileCoord): PdfRect {
  const paint = tilePaintRect(grid, page, c);
  return {
    left: paint.x,
    right: paint.x + paint.width,
    top: page.height - paint.y,
    bottom: page.height - (paint.y + paint.height),
  };
}

/**
 * Does a set of PAINTED want-level tiles cover `region` (y-down points)?
 * The retention release check: a retained source may leave the paint list
 * once its visible footprint answers true here. Pure index arithmetic on
 * the aligned grid — the whole reason the pyramid is aligned.
 */
export function regionCovered(
  grid: TileGrid,
  page: PageSizePt,
  region: Rect,
  isPainted: (c: TileCoord) => boolean,
): boolean {
  if (region.width <= 0 || region.height <= 0) return true;
  for (const c of tilesInRect(grid, page, region)) {
    if (!isPainted(c)) return false;
  }
  return true;
}

/**
 * Inflate a visible rect by a prefetch margin (fractions of the rect's own
 * size per side), optionally velocity-biased: the margin stretches toward
 * the direction of travel and shrinks behind it. Pure — the producer's
 * velocity is just data.
 */
export function inflateRect(
  rect: Rect,
  margin: number,
  velocity?: { dx: number; dy: number },
): Rect {
  const mx = rect.width * margin;
  const my = rect.height * margin;
  let left = mx;
  let right = mx;
  let up = my;
  let down = my;
  if (velocity) {
    // Direction buckets only — raw magnitudes would make the want set
    // churn with every pointer sample.
    if (velocity.dx > 0) {
      right = mx * 2;
      left = mx / 2;
    } else if (velocity.dx < 0) {
      left = mx * 2;
      right = mx / 2;
    }
    if (velocity.dy > 0) {
      down = my * 2;
      up = my / 2;
    } else if (velocity.dy < 0) {
      up = my * 2;
      down = my / 2;
    }
  }
  return {
    x: rect.x - left,
    y: rect.y - up,
    width: rect.width + left + right,
    height: rect.height + up + down,
  };
}

/** Snap UP through a pyramid's sorted scales; cap at the top. */
export function snapToPyramid(scales: readonly number[], needed: number): number {
  const sorted = [...scales].sort((a, b) => a - b);
  return sorted.find((s) => s >= needed) ?? sorted[sorted.length - 1]!;
}
