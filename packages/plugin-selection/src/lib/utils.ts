import { PdfGlyphSlim, PdfPageGeometry, Position, Rect } from '@embedpdf/models';
import { SelectionRangeX } from './types';

/**
 * Hit-test helper using runs
 * @param geo - page geometry
 * @param pt - point
 * @returns glyph index
 */
export function glyphAt(geo: PdfPageGeometry, pt: Position) {
  for (const run of geo.runs) {
    const inRun =
      pt.y >= run.rect.y &&
      pt.y <= run.rect.y + run.rect.height &&
      pt.x >= run.rect.x &&
      pt.x <= run.rect.x + run.rect.width;

    if (!inRun) continue;

    // Simply check if the point is within any glyph's bounding box
    const rel = run.glyphs.findIndex(
      (g) => pt.x >= g.x && pt.x <= g.x + g.width && pt.y >= g.y && pt.y <= g.y + g.height,
    );

    if (rel !== -1) {
      return run.charStart + rel;
    }
  }
  return -1;
}

/**
 * Helper: min/max glyph indices on `page` for current sel
 * @param sel - selection range
 * @param geo - page geometry
 * @param page - page index
 * @returns { from: number; to: number } | null
 */
export function sliceBounds(
  sel: SelectionRangeX | null,
  geo: PdfPageGeometry | undefined,
  page: number,
): { from: number; to: number } | null {
  if (!sel || !geo) return null;
  if (page < sel.start.page || page > sel.end.page) return null;

  const from = page === sel.start.page ? sel.start.index : 0;

  const lastRun = geo.runs[geo.runs.length - 1];
  const lastCharOnPage = lastRun.charStart + lastRun.glyphs.length - 1;

  const to = page === sel.end.page ? sel.end.index : lastCharOnPage;

  return { from, to };
}

/**
 * Helper: build rects for a slice of the page
 * @param geo - page geometry
 * @param from - from index
 * @param to - to index
 * @param merge - whether to merge adjacent rects (default: true)
 * @returns rects
 */
export function rectsWithinSlice(
  geo: PdfPageGeometry,
  from: number,
  to: number,
  merge: boolean = true,
): Rect[] {
  const textRuns: TextRunInfo[] = [];

  for (const run of geo.runs) {
    const runStart = run.charStart;
    const runEnd = runStart + run.glyphs.length - 1;
    if (runEnd < from || runStart > to) continue;

    const sIdx = Math.max(from, runStart) - runStart;
    const eIdx = Math.min(to, runEnd) - runStart;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let charCount = 0;

    for (let i = sIdx; i <= eIdx; i++) {
      const g = run.glyphs[i];
      if (g.flags === 2) continue; // empty glyph

      minX = Math.min(minX, g.x);
      maxX = Math.max(maxX, g.x + g.width);
      minY = Math.min(minY, g.y);
      maxY = Math.max(maxY, g.y + g.height);
      charCount++;
    }

    if (minX !== Infinity && charCount > 0) {
      textRuns.push({
        rect: {
          origin: { x: minX, y: minY },
          size: { width: maxX - minX, height: maxY - minY },
        },
        charCount,
      });
    }
  }

  // If merge is false, just return the individual rects
  if (!merge) {
    return textRuns.map((run) => run.rect);
  }

  // Otherwise merge adjacent rects
  return mergeAdjacentRects(textRuns);
}

/**
 * ============================================================================
 * Rectangle Merging Algorithm
 * ============================================================================
 *
 * The following code is adapted from Chromium's PDF text selection implementation.
 *
 * Copyright 2010 The Chromium Authors
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file: https://source.chromium.org/chromium/chromium/src/+/main:LICENSE
 *
 * Original source:
 * https://source.chromium.org/chromium/chromium/src/+/main:pdf/pdfium/pdfium_range.cc
 *
 * Adapted for TypeScript and this project's Rect/geometry types.
 */

/**
 * Text run info for rect merging (similar to Chromium's ScreenRectTextRunInfo)
 */
export interface TextRunInfo {
  rect: Rect;
  charCount: number;
}

/**
 * Helper functions for Rect operations
 */
export function rectUnion(rect1: Rect, rect2: Rect): Rect {
  const left = Math.min(rect1.origin.x, rect2.origin.x);
  const top = Math.min(rect1.origin.y, rect2.origin.y);
  const right = Math.max(rect1.origin.x + rect1.size.width, rect2.origin.x + rect2.size.width);
  const bottom = Math.max(rect1.origin.y + rect1.size.height, rect2.origin.y + rect2.size.height);

  return {
    origin: { x: left, y: top },
    size: { width: right - left, height: bottom - top },
  };
}

export function rectIntersect(rect1: Rect, rect2: Rect): Rect {
  const left = Math.max(rect1.origin.x, rect2.origin.x);
  const top = Math.max(rect1.origin.y, rect2.origin.y);
  const right = Math.min(rect1.origin.x + rect1.size.width, rect2.origin.x + rect2.size.width);
  const bottom = Math.min(rect1.origin.y + rect1.size.height, rect2.origin.y + rect2.size.height);

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  return {
    origin: { x: left, y: top },
    size: { width, height },
  };
}

export function rectIsEmpty(rect: Rect): boolean {
  return rect.size.width <= 0 || rect.size.height <= 0;
}

/**
 * Returns a ratio between [0, 1] representing vertical overlap
 */
export function getVerticalOverlap(rect1: Rect, rect2: Rect): number {
  if (rectIsEmpty(rect1) || rectIsEmpty(rect2)) return 0;

  const unionRect = rectUnion(rect1, rect2);

  if (unionRect.size.height === rect1.size.height || unionRect.size.height === rect2.size.height) {
    return 1.0;
  }

  const intersectRect = rectIntersect(rect1, rect2);
  return intersectRect.size.height / unionRect.size.height;
}

/**
 * Returns true if there is sufficient horizontal and vertical overlap
 */
export function shouldMergeHorizontalRects(textRun1: TextRunInfo, textRun2: TextRunInfo): boolean {
  const VERTICAL_OVERLAP_THRESHOLD = 0.8;
  const rect1 = textRun1.rect;
  const rect2 = textRun2.rect;

  if (getVerticalOverlap(rect1, rect2) < VERTICAL_OVERLAP_THRESHOLD) {
    return false;
  }

  const HORIZONTAL_WIDTH_FACTOR = 1.0;
  const averageWidth1 = (HORIZONTAL_WIDTH_FACTOR * rect1.size.width) / textRun1.charCount;
  const averageWidth2 = (HORIZONTAL_WIDTH_FACTOR * rect2.size.width) / textRun2.charCount;

  const rect1Left = rect1.origin.x - averageWidth1;
  const rect1Right = rect1.origin.x + rect1.size.width + averageWidth1;
  const rect2Left = rect2.origin.x - averageWidth2;
  const rect2Right = rect2.origin.x + rect2.size.width + averageWidth2;

  return rect1Left < rect2Right && rect1Right > rect2Left;
}

/**
 * Merge adjacent rectangles based on proximity and overlap (similar to Chromium's algorithm)
 */
export function mergeAdjacentRects(textRuns: TextRunInfo[]): Rect[] {
  const results: Rect[] = [];
  let previousTextRun: TextRunInfo | null = null;
  let currentRect: Rect | null = null;

  for (const textRun of textRuns) {
    if (previousTextRun && currentRect) {
      if (shouldMergeHorizontalRects(previousTextRun, textRun)) {
        currentRect = rectUnion(currentRect, textRun.rect);
      } else {
        results.push(currentRect);
        currentRect = textRun.rect;
      }
    } else {
      currentRect = textRun.rect;
    }
    previousTextRun = textRun;
  }

  if (currentRect && !rectIsEmpty(currentRect)) {
    results.push(currentRect);
  }

  return results;
} 


/**
 * Calculates the Euclidean distance between two points
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance between the points in PDF units
 */
function distance(p1: Position, p2: Position): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

/**
 * Fast squared distance calculation - avoids expensive sqrt operation
 * Use when you only need to compare distances
 */
function distanceSquared(p1: Position, p2: Position): number {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

/**
 * Calculates the center point of a glyph
 * @param glyph - The glyph to find the center of
 * @returns Position object representing the glyph's center coordinates
 */
function getGlyphCenter(glyph: PdfGlyphSlim): Position {
  return {
    x: glyph.x + glyph.width / 2,
    y: glyph.y + glyph.height / 2,
  };
}

/**
 * Checks if a point is within the bounds of a glyph
 * @param pt - Point to check
 * @param glyphBounds - Bounds of the glyph
 * @returns true if the point is within the glyph bounds, false otherwise
 */
function isPointInGlyphBounds(
  pt: Position,
  glyphBounds: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    pt.x >= glyphBounds.x &&
    pt.x <= glyphBounds.x + glyphBounds.width &&
    pt.y >= glyphBounds.y &&
    pt.y <= glyphBounds.y + glyphBounds.height
  );
}

/**
 * Optimized glyph index entry with reduced memory footprint
 * Stores only essential data, calculates bounds on-demand from source
 */
interface GlyphIndexEntry {
  /** Global character index across the entire page */
  globalIndex: number;
  /** Center point of the glyph for distance calculations */
  center: Position;
  /** Index of the run this glyph belongs to */
  runIndex: number;
  /** Index within the run for quick glyph access */
  glyphIndexInRun: number;
}

/**
 * Helper function to get glyph bounds from the model
 * Avoids storing duplicate bound information
 */
function getGlyphBounds(model: GlyphAccelerationModel, entry: GlyphIndexEntry) {
  const run = model.geo.runs[entry.runIndex];
  const glyph = run.glyphs[entry.glyphIndexInRun];
  return {
    x: glyph.x,
    y: glyph.y,
    width: glyph.width,
    height: glyph.height,
  };
}

/**
 * Represents a horizontal line of text on the page
 * Groups glyphs that appear on the same text line
 */
interface TextLineIndex {
  /**
   * Minimum Y coordinate of this text line
   */
  yMin: number;
  /**
   * Maximum Y coordinate of this text line
   */
  yMax: number;
  /**
   * Average Y coordinate (center line) for this text line
   */
  centerY: number;
  /**
   * All glyphs that belong to this text line, sorted left-to-right
   */
  glyphs: GlyphIndexEntry[];
}

/**
 * A single cell in the spatial acceleration grid
 * Contains glyphs that fall within this grid cell's bounds
 */
interface GridCell {
  /**
   * All glyphs whose centers fall within this grid cell
   */
  glyphs: GlyphIndexEntry[];
}

/**
 * Complete acceleration structure for efficient text selection
 * Organizes glyphs into lines and a spatial grid for fast nearest-neighbor queries
 */
export interface GlyphAccelerationModel {
  /**
   * All detected text lines on the page, sorted top-to-bottom
   */
  lines: TextLineIndex[];
  /**
   * Spatial grid that divides the page into cells for faster lookups
   */
  grid: {
    /**
     * Bounding rectangle that encompasses all text on the page
     */
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    /**
     * Number of rows in the spatial grid
     */
    rows: number;
    /**
     * Number of columns in the spatial grid
     */
    cols: number;
    /**
     * Width of each grid cell in PDF units
     */
    cellWidth: number;
    /**
     * Height of each grid cell in PDF units
     */
    cellHeight: number;
    /**
     * 2D array of grid cells (rows x cols)
     */
    cells: GridCell[][];
  };
  /**
   * Flat array of all glyphs on the page for fallback searches
   */
  allGlyphs: GlyphIndexEntry[];
  geo: PdfPageGeometry;
}

/**
 * Builds an acceleration structure for efficient text selection queries
 * This function processes the raw PDF geometry and creates optimized data structures
 * for fast nearest-neighbor searches and text selection operations
 *
 * @param geo - Raw PDF page geometry containing all text runs
 * @returns Complete acceleration model with lines, grid, and glyph index
 */
export function buildGlyphAccelerationModel(geo: PdfPageGeometry): GlyphAccelerationModel {
  // Collect all glyphs from all runs into a flat array with indexing information
  const allGlyphs: GlyphIndexEntry[] = [];
  const lines: TextLineIndex[] = [];

  // Process each text run in the document
  for (let runIndex = 0; runIndex < geo.runs.length; runIndex++) {
    const run = geo.runs[runIndex];

    // Process each glyph within the current run
    for (let glyphIndex = 0; glyphIndex < run.glyphs.length; glyphIndex++) {
      const glyph = run.glyphs[glyphIndex];
      const center = getGlyphCenter(glyph);

      // Create optimized indexed entry for this glyph
      const entry: GlyphIndexEntry = {
        globalIndex: run.charStart + glyphIndex,
        center,
        runIndex,
        glyphIndexInRun: glyphIndex,
      };

      allGlyphs.push(entry);
    }
  }

  // Group glyphs into text lines - highly optimized approach
  // Calculate average glyph height from source data to avoid bounds storage
  let totalHeight = 0;
  let glyphCount = 0;
  for (const run of geo.runs) {
    for (const glyph of run.glyphs) {
      totalHeight += glyph.height;
      glyphCount++;
    }
  }
  const avgGlyphHeight = glyphCount > 0 ? totalHeight / glyphCount : 10;
  const lineThreshold = Math.max(3, avgGlyphHeight * 0.5);

  // Sort glyphs by Y coordinate for efficient line grouping
  allGlyphs.sort((a, b) => a.center.y - b.center.y);
  
  // Ultra-optimized line grouping using binary-like approach
  const lineGroups: GlyphIndexEntry[][] = [];
  const lineAverages: number[] = []; // Cache line averages for O(1) lookup
  
  for (const glyph of allGlyphs) {
    let foundLine = false;
    
    // Binary search-like approach for finding matching line
    const checkLines = Math.min(5, lineGroups.length);
    for (let i = lineGroups.length - checkLines; i < lineGroups.length; i++) {
      if (Math.abs(glyph.center.y - lineAverages[i]) <= lineThreshold) {
        const line = lineGroups[i];
        line.push(glyph);
        // Update cached average incrementally
        lineAverages[i] = (lineAverages[i] * (line.length - 1) + glyph.center.y) / line.length;
        foundLine = true;
        break;
      }
    }
    
    if (!foundLine) {
      lineGroups.push([glyph]);
      lineAverages.push(glyph.center.y);
    }
  }

  // Process line groups and calculate properties efficiently
  for (const lineGlyphs of lineGroups) {
    // Sort glyphs left-to-right within each line
    lineGlyphs.sort((a, b) => a.center.x - b.center.x);

    // Calculate line boundaries efficiently by accessing source data
    let yMin = Infinity, yMax = -Infinity, centerYSum = 0;
    
    for (const glyphEntry of lineGlyphs) {
      const run = geo.runs[glyphEntry.runIndex];
      const glyph = run.glyphs[glyphEntry.glyphIndexInRun];
      
      yMin = Math.min(yMin, glyph.y);
      yMax = Math.max(yMax, glyph.y + glyph.height);
      centerYSum += glyphEntry.center.y;
    }
    
    const centerY = centerYSum / lineGlyphs.length;

    lines.push({
      yMin,
      yMax,
      centerY,
      glyphs: lineGlyphs,
    });
  }

  // Lines are already roughly sorted due to our processing order
  lines.sort((a, b) => a.centerY - b.centerY);

  // Calculate overall bounds for the spatial grid - optimized to avoid bounds storage
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const glyphEntry of allGlyphs) {
    const run = geo.runs[glyphEntry.runIndex];
    const glyph = run.glyphs[glyphEntry.glyphIndexInRun];
    
    minX = Math.min(minX, glyph.x);
    minY = Math.min(minY, glyph.y);
    maxX = Math.max(maxX, glyph.x + glyph.width);
    maxY = Math.max(maxY, glyph.y + glyph.height);
  }

  const gridWidth = maxX - minX;
  const gridHeight = maxY - minY;

  // Calculate optimal grid dimensions based on glyph density
  const avgGlyphsPerCell = Math.max(5, Math.min(20, Math.sqrt(allGlyphs.length))); // Dynamic target based on document size
  const totalCells = Math.max(1, Math.ceil(allGlyphs.length / avgGlyphsPerCell));
  const aspectRatio = gridWidth / gridHeight;
  const gridCols = Math.max(1, Math.ceil(Math.sqrt(totalCells * aspectRatio)));
  const gridRows = Math.max(1, Math.ceil(totalCells / gridCols));

  const cellWidth = gridWidth / gridCols;
  const cellHeight = gridHeight / gridRows;

  // Initialize empty grid cells
  const cells: GridCell[][] = [];
  for (let row = 0; row < gridRows; row++) {
    cells[row] = [];
    for (let col = 0; col < gridCols; col++) {
      cells[row][col] = { glyphs: [] };
    }
  }

  // Assign glyphs to grid cells based on their positions
  for (const glyph of allGlyphs) {
    const col = Math.min(
      gridCols - 1,
      Math.max(0, Math.floor((glyph.center.x - minX) / cellWidth)),
    );
    const row = Math.min(
      gridRows - 1,
      Math.max(0, Math.floor((glyph.center.y - minY) / cellHeight)),
    );
    cells[row][col].glyphs.push(glyph);
  }

  return {
    geo,
    lines,
    grid: {
      bounds: { x: minX, y: minY, width: gridWidth, height: gridHeight },
      rows: gridRows,
      cols: gridCols,
      cellWidth,
      cellHeight,
      cells,
    },
    allGlyphs,
  };
}

/**
 * Represents the result of finding the nearest glyph to a point
 * Contains detailed information about the matched glyph and its context
 */
export interface NearestGlyphResult {
  /**
   * Global character index across the entire page
   */
  globalIndex: number;
  /**
   * Index of the run containing this glyph in PdfPageGeometry.runs array
   */
  runIndex: number;
  /**
   * Index of this glyph within its containing run (0-based)
   */
  glyphIndexInRun: number;
  /**
   * Whether the point is exactly within the glyph bounds (true) or is the nearest glyph (false)
   */
  isExactMatch: boolean;
  /**
   * Distance from the query point to the glyph center in PDF units
   */
  distance: number;
}

/**
 * Finds the nearest glyph to a given point using the acceleration model
 * Employs a multi-stage search strategy: line-based search first, then grid-based fallback
 *
 * @param model - Pre-built acceleration model containing glyphs organized by lines and grid
 * @param pt - Query point in PDF coordinate space
 * @param geo - PDF page geometry containing all text runs (needed for run information)
 * @returns Detailed information about the nearest glyph, or null if no glyphs found
 */
export function findNearestGlyphWithModel(
  model: GlyphAccelerationModel,
  pt: Position,
): NearestGlyphResult | null {
  // Handle empty page case
  if (model.allGlyphs.length === 0) {
    return null;
  }
  const geo = model.geo;

  const candidateLines: TextLineIndex[] = [];

  // Stage 1: Binary search to find the closest text line
  let left = 0;
  let right = model.lines.length - 1;
  let closestLineIndex = 0;
  let minYDistance = Infinity;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const line = model.lines[mid];
    const yDistance = Math.abs(pt.y - line.centerY);

    if (yDistance < minYDistance) {
      minYDistance = yDistance;
      closestLineIndex = mid;
    }

    if (pt.y < line.centerY) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // Collect nearby lines for detailed search - adaptive radius based on line density
  const searchRadius = Math.min(3, Math.max(1, Math.ceil(model.lines.length / 20)));
  const startLine = Math.max(0, closestLineIndex - searchRadius);
  const endLine = Math.min(model.lines.length - 1, closestLineIndex + searchRadius);

  for (let i = startLine; i <= endLine; i++) {
    candidateLines.push(model.lines[i]);
  }

  // Stage 2: Search within candidate lines for the nearest glyph
  let minDistance = Infinity;
  let nearestGlyph: GlyphIndexEntry | null = null;

  for (const line of candidateLines) {
    const yDistanceToLine = Math.abs(pt.y - line.centerY);

    // Binary search within this line to find the closest glyph horizontally
    let lineLeft = 0;
    let lineRight = line.glyphs.length - 1;
    let bestInLine: GlyphIndexEntry | null = null;
    let minXDistance = Infinity;

    while (lineLeft <= lineRight) {
      const mid = Math.floor((lineLeft + lineRight) / 2);
      const glyph = line.glyphs[mid];
      const xDistance = Math.abs(pt.x - glyph.center.x);

      if (xDistance < minXDistance) {
        minXDistance = xDistance;
        bestInLine = glyph;
      }

      if (pt.x < glyph.center.x) {
        lineRight = mid - 1;
      } else {
        lineLeft = mid + 1;
      }
    }

    // Check the best glyph and its immediate neighbors for more accurate results
    const candidateIndices: number[] = [];
    if (bestInLine) {
      const bestIndex = line.glyphs.indexOf(bestInLine);
      candidateIndices.push(bestIndex);

      // Include adjacent glyphs to handle cases where the binary search might have missed
      if (bestIndex > 0) candidateIndices.push(bestIndex - 1);
      if (bestIndex < line.glyphs.length - 1) candidateIndices.push(bestIndex + 1);
    }

    // Evaluate all candidate glyphs using fast squared distance for comparison
    for (const index of candidateIndices) {
      const glyph = line.glyphs[index];
      const distSq = distanceSquared(pt, glyph.center);

      // Weight the distance to favor glyphs closer to the query point's Y coordinate
      const weightedDistanceSq = distSq + (yDistanceToLine * yDistanceToLine * 4);

      if (weightedDistanceSq < minDistance) {
        minDistance = weightedDistanceSq;
        nearestGlyph = glyph;
      }
    }
  }

  // Stage 3: Fallback to grid-based search if line search didn't find a good match
  // Calculate fallback threshold based on a reasonable default
  const fallbackThreshold = 100; // Fixed threshold for simplicity and performance
  if (!nearestGlyph || minDistance > fallbackThreshold) {
    const grid = model.grid;

    // Find the grid cell containing the query point
    const centerCol = Math.floor((pt.x - grid.bounds.x) / grid.cellWidth);
    const centerRow = Math.floor((pt.y - grid.bounds.y) / grid.cellHeight);

    // Search nearby grid cells - adaptive radius based on grid density
    const searchRadiusGrid = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(grid.rows * grid.cols) / 10)));

    for (
      let row = Math.max(0, centerRow - searchRadiusGrid);
      row <= Math.min(grid.rows - 1, centerRow + searchRadiusGrid);
      row++
    ) {
      for (
        let col = Math.max(0, centerCol - searchRadiusGrid);
        col <= Math.min(grid.cols - 1, centerCol + searchRadiusGrid);
        col++
      ) {
        const cell = grid.cells[row][col];

        // Check all glyphs in this grid cell using fast squared distance
        for (const glyph of cell.glyphs) {
          const distSq = distanceSquared(pt, glyph.center);

          if (distSq < minDistance) {
            minDistance = distSq;
            nearestGlyph = glyph;
          }
        }
      }
    }
  }

  // If no glyph found, return null
  if (!nearestGlyph) {
    return null;
  }

  // Calculate glyph index within its run
  const run = geo.runs[nearestGlyph.runIndex];
  const glyphIndexInRun = nearestGlyph.globalIndex - run.charStart;

  // Check if the point is exactly within the glyph bounds
  const glyphBounds = getGlyphBounds(model, nearestGlyph);
  const isExactMatch = isPointInGlyphBounds(pt, glyphBounds);

  // Return detailed information about the nearest glyph
  // Convert squared distance back to actual distance only at the end
  return {
    globalIndex: nearestGlyph.globalIndex,
    runIndex: nearestGlyph.runIndex,
    glyphIndexInRun,
    isExactMatch,
    distance: Math.sqrt(minDistance),
  };
}
