import type { Rect } from '@embedpdf/core-geometry';

// One owner for space math: rect intersection lives in core-geometry
// (the stage's visibility computation uses the same helper).
export { intersectRects } from '@embedpdf/core-geometry';

/**
 * Pure tile-grid math.
 *
 * The pyramid is aligned: one origin (the page's top-left), a fixed tile
 * size in device pixels, and ×2 scale steps. Alignment is what makes the
 * retention bookkeeping index arithmetic instead of rectangle geometry —
 * a level-s tile is covered by exactly the level-2s tiles whose indices
 * fall in its doubled range, so occlusion/release checks are O(1).
 *
 * Spaces: tile coords live on the device grid at their level's scale
 * (tileSize² device px per tile, constant per-job cost by construction);
 * paint rects are y-down page points (the viewer convention — the layer
 * multiplies by one container transform); engine rects are y-up PDF user
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
  const firstColumn = Math.max(0, Math.floor(rect.x / span));
  const firstRow = Math.max(0, Math.floor(rect.y / span));
  const lastColumn = Math.min(grid.cols - 1, Math.ceil((rect.x + rect.width) / span) - 1);
  const lastRow = Math.min(grid.rows - 1, Math.ceil((rect.y + rect.height) / span) - 1);
  const coords: TileCoord[] = [];
  for (let iy = firstRow; iy <= lastRow; iy++) {
    for (let ix = firstColumn; ix <= lastColumn; ix++) coords.push({ ix, iy });
  }
  return coords;
}

/** Paint rect: y-down page points, clamped to the page edge. */
export function tilePaintRect(grid: TileGrid, page: PageSizePt, coord: TileCoord): Rect {
  const span = tileSpanPt(grid);
  const x = coord.ix * span;
  const y = coord.iy * span;
  return {
    x,
    y,
    width: Math.min(span, page.width - x),
    height: Math.min(span, page.height - y),
  };
}

/**
 * Expand a paint rect by `amountPt` page points per side, clamped to the page —
 * the tile bleed. Neighboring tiles rendered with bleed overlap by twice
 * this amount, and the overlapping strips contain identical content (same
 * page region, same scale), so every img edge composites over its
 * neighbor's duplicated pixels instead of the backdrop: no AA hairlines,
 * no bilinear edge smear, at any CSS stretch.
 */
export function bleedRect(rect: Rect, amountPt: number, page: PageSizePt): Rect {
  const x = Math.max(0, rect.x - amountPt);
  const y = Math.max(0, rect.y - amountPt);
  return {
    x,
    y,
    width: Math.min(page.width, rect.x + rect.width + amountPt) - x,
    height: Math.min(page.height, rect.y + rect.height + amountPt) - y,
  };
}

/**
 * Does a set of painted want-level tiles cover `region` (y-down points)?
 * The retention release check: a retained source may leave the paint list
 * once its visible footprint answers true here. Pure index arithmetic on
 * the aligned grid — the whole reason the pyramid is aligned.
 */
export function regionCovered(
  grid: TileGrid,
  page: PageSizePt,
  region: Rect,
  isPainted: (coord: TileCoord) => boolean,
): boolean {
  if (region.width <= 0 || region.height <= 0) return true;
  for (const coord of tilesInRect(grid, page, region)) {
    if (!isPainted(coord)) return false;
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
  const marginX = rect.width * margin;
  const marginY = rect.height * margin;
  let left = marginX;
  let right = marginX;
  let up = marginY;
  let down = marginY;
  if (velocity) {
    // Direction buckets only — raw magnitudes would make the want set
    // churn with every pointer sample.
    if (velocity.dx > 0) {
      right = marginX * 2;
      left = marginX / 2;
    } else if (velocity.dx < 0) {
      left = marginX * 2;
      right = marginX / 2;
    }
    if (velocity.dy > 0) {
      down = marginY * 2;
      up = marginY / 2;
    } else if (velocity.dy < 0) {
      up = marginY * 2;
      down = marginY / 2;
    }
  }
  return {
    x: rect.x - left,
    y: rect.y - up,
    width: rect.width + left + right,
    height: rect.height + up + down,
  };
}

/** Snap up through a pyramid's sorted scales; cap at the top. */
export function snapToPyramid(scales: readonly number[], needed: number): number {
  const sorted = [...scales].sort((left, right) => left - right);
  return sorted.find((scale) => scale >= needed) ?? sorted[sorted.length - 1]!;
}
