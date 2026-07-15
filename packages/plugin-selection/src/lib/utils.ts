import {
  buildSegmentQuadFromGlyphQuads,
  matricesCompatible,
  matrixBaselineDirection,
  PdfPageGeometry,
  PdfRun,
  Position,
  projectOnDirection,
  Quad,
  quadToRect,
  quadsToRects,
  Rect,
} from '@embedpdf/models';
import { SelectionRangeX } from './types';

/**
 * Hit-test helper using runs, with tolerance-based fallback.
 *
 * Adapted from PDFium's FPDFText_GetCharIndexAtPos / CPDF_TextPage::GetIndexAtPos:
 *  1. Exact match: return the glyph whose bounding box contains the point.
 *  2. Tolerance expansion: expand each glyph box by tolerance/2 on every side,
 *     then pick the closest glyph by Manhattan distance.
 *
 * @param geo - page geometry
 * @param pt - point in page coordinates
 * @param toleranceFactor - multiplied by average glyph height to derive the
 *                          tolerance radius. 0 disables the fallback.
 *                          Default 1.5 (see Chromium's pdfium-page.cc kTolerance).
 * @returns glyph index, or -1 if nothing was hit
 */
export function glyphAt(geo: PdfPageGeometry, pt: Position, toleranceFactor = 1.5): number {
  // --- Pass 1: exact bounding-box match using tight bounds (char_box) ---
  // Matches PDFium's GetIndexAtPos first-pass check at cpdf_textpage.cpp:494
  for (const run of geo.runs) {
    const inRun =
      pt.y >= run.rect.y &&
      pt.y <= run.rect.y + run.rect.height &&
      pt.x >= run.rect.x &&
      pt.x <= run.rect.x + run.rect.width;

    if (!inRun) continue;

    const rel = run.glyphs.findIndex((g) => {
      const gx = g.tightX ?? g.x;
      const gy = g.tightY ?? g.y;
      const gw = g.tightWidth ?? g.width;
      const gh = g.tightHeight ?? g.height;
      return pt.x >= gx && pt.x <= gx + gw && pt.y >= gy && pt.y <= gy + gh;
    });

    if (rel !== -1) {
      return run.charStart + rel;
    }
  }

  if (toleranceFactor <= 0) return -1;

  // --- Pass 2: tolerance-expanded match using tight bounds ---
  // Matches PDFium's GetIndexAtPos tolerance pass at cpdf_textpage.cpp:502-520
  const tolerance = computeTolerance(geo, toleranceFactor);
  const halfTol = tolerance / 2;

  let bestIndex = -1;
  let bestDist = Infinity;

  for (const run of geo.runs) {
    if (
      pt.y < run.rect.y - halfTol ||
      pt.y > run.rect.y + run.rect.height + halfTol ||
      pt.x < run.rect.x - halfTol ||
      pt.x > run.rect.x + run.rect.width + halfTol
    ) {
      continue;
    }

    for (let i = 0; i < run.glyphs.length; i++) {
      const g = run.glyphs[i];
      if (g.flags === 2) continue;

      const gx = g.tightX ?? g.x;
      const gy = g.tightY ?? g.y;
      const gw = g.tightWidth ?? g.width;
      const gh = g.tightHeight ?? g.height;

      const expandedLeft = gx - halfTol;
      const expandedRight = gx + gw + halfTol;
      const expandedTop = gy - halfTol;
      const expandedBottom = gy + gh + halfTol;

      if (
        pt.x < expandedLeft ||
        pt.x > expandedRight ||
        pt.y < expandedTop ||
        pt.y > expandedBottom
      ) {
        continue;
      }

      const curXdif = Math.min(Math.abs(pt.x - gx), Math.abs(pt.x - (gx + gw)));
      const curYdif = Math.min(Math.abs(pt.y - gy), Math.abs(pt.y - (gy + gh)));
      const dist = curXdif + curYdif;

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = run.charStart + i;
      }
    }
  }

  return bestIndex;
}

/**
 * Derive a tolerance value from the average non-empty glyph height on the page.
 */
function computeTolerance(geo: PdfPageGeometry, factor: number): number {
  let totalHeight = 0;
  let count = 0;

  for (const run of geo.runs) {
    for (const g of run.glyphs) {
      if (g.flags === 2) continue;
      totalHeight += g.height;
      count++;
    }
  }

  if (count === 0) return 0;
  return (totalHeight / count) * factor;
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
 * Helper: build oriented quads and derived rects for a slice of the page.
 */
export function quadsWithinSlice(
  geo: PdfPageGeometry,
  from: number,
  to: number,
  merge: boolean = true,
): { quads: Quad[]; rects: Rect[] } {
  const segmentQuads: Quad[] = [];
  const textRuns: TextRunInfo[] = [];

  const CHAR_DISTANCE_FACTOR = 2.5;

  for (const run of geo.runs) {
    const runStart = run.charStart;
    const runEnd = runStart + run.glyphs.length - 1;
    if (runEnd < from || runStart > to) continue;

    const sIdx = Math.max(from, runStart) - runStart;
    const eIdx = Math.min(to, runEnd) - runStart;

    let segmentGlyphs: Array<(typeof run.glyphs)[number]> = [];
    let widthSum = 0;
    let prevTrailing = -Infinity;
    let segmentOrigin: Position | null = null;
    let segmentDir: Position | null = null;

    const flushSegment = () => {
      if (segmentGlyphs.length === 0) return;

      const first = segmentGlyphs[0];
      const last = segmentGlyphs[segmentGlyphs.length - 1];

      if (first.quad && last.quad) {
        const quad = buildSegmentQuadFromGlyphQuads(first.quad, last.quad);
        segmentQuads.push(quad);
        textRuns.push({
          rect: quadToRect(quad),
          charCount: segmentGlyphs.length,
          fontSize: run.fontSize,
        });
      } else {
        let minX = Infinity,
          maxX = -Infinity;
        let minY = Infinity,
          maxY = -Infinity;

        for (const g of segmentGlyphs) {
          minX = Math.min(minX, g.x);
          maxX = Math.max(maxX, g.x + g.width);
          minY = Math.min(minY, g.y);
          maxY = Math.max(maxY, g.y + g.height);
        }

        if (minX !== Infinity) {
          const rect = {
            origin: { x: minX, y: minY },
            size: { width: maxX - minX, height: maxY - minY },
          };
          textRuns.push({
            rect,
            charCount: segmentGlyphs.length,
            fontSize: run.fontSize,
          });
        }
      }

      segmentGlyphs = [];
      widthSum = 0;
      prevTrailing = -Infinity;
      segmentOrigin = null;
      segmentDir = null;
    };

    for (let i = sIdx; i <= eIdx; i++) {
      const g = run.glyphs[i];
      if (g.flags === 2) continue;

      const dir = g.matrix ? matrixBaselineDirection(g.matrix) : { x: 1, y: 0 };
      const origin = g.pageOrigin ?? { x: g.x, y: g.y + g.height };

      if (segmentGlyphs.length > 0) {
        const prev = segmentGlyphs[segmentGlyphs.length - 1];
        const compatible =
          !prev.matrix || !g.matrix || matricesCompatible(prev.matrix, g.matrix);

        if (!compatible) {
          flushSegment();
        } else if (prevTrailing > -Infinity && segmentDir) {
          const leading = projectOnDirection(
            { x: g.x, y: g.y },
            segmentOrigin!,
            segmentDir,
          );
          const gap = Math.abs(leading - prevTrailing);
          const avgWidth = widthSum / segmentGlyphs.length;
          if (avgWidth > 0 && gap > CHAR_DISTANCE_FACTOR * avgWidth) {
            flushSegment();
          }
        }
      }

      if (segmentGlyphs.length === 0) {
        segmentOrigin = origin;
        segmentDir = dir;
      }

      segmentGlyphs.push(g);
      widthSum += g.width;

      if (g.quad) {
        prevTrailing = Math.max(
          projectOnDirection(g.quad.p2, segmentOrigin!, segmentDir!),
          projectOnDirection(g.quad.p3, segmentOrigin!, segmentDir!),
        );
      } else {
        prevTrailing = projectOnDirection(
          { x: g.x + g.width, y: g.y + g.height / 2 },
          segmentOrigin!,
          segmentDir!,
        );
      }
    }

    flushSegment();
  }

  if (!merge) {
    return {
      quads: segmentQuads,
      rects: textRuns.map((run) => run.rect),
    };
  }

  const mergedRects = mergeAdjacentRects(textRuns);
  if (segmentQuads.length === textRuns.length) {
    return { quads: segmentQuads, rects: mergedRects };
  }

  return {
    quads: segmentQuads,
    rects: quadsToRects(segmentQuads.length > 0 ? segmentQuads : textRuns.map((r) => ({
      p1: { x: r.rect.origin.x, y: r.rect.origin.y },
      p2: { x: r.rect.origin.x + r.rect.size.width, y: r.rect.origin.y },
      p3: {
        x: r.rect.origin.x + r.rect.size.width,
        y: r.rect.origin.y + r.rect.size.height,
      },
      p4: { x: r.rect.origin.x, y: r.rect.origin.y + r.rect.size.height },
    }))),
  };
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
  return quadsWithinSlice(geo, from, to, merge).rects;
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
 * Text run info for rect merging (similar to Chromium's PdfRectTextRunInfo)
 */
export interface TextRunInfo {
  rect: Rect;
  charCount: number;
  fontSize?: number;
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
  const FONT_SIZE_RATIO_THRESHOLD = 1.5;
  if (
    textRun1.fontSize != null &&
    textRun2.fontSize != null &&
    textRun1.fontSize > 0 &&
    textRun2.fontSize > 0
  ) {
    const ratio =
      Math.max(textRun1.fontSize, textRun2.fontSize) /
      Math.min(textRun1.fontSize, textRun2.fontSize);
    if (ratio > FONT_SIZE_RATIO_THRESHOLD) {
      return false;
    }
  }

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
 * Merge adjacent rectangles based on proximity and overlap.
 *
 * Adapted from Chromium's MergeAdjacentRects (pdfium_range.cc):
 *  - The merge DECISION uses the loose `rect` (via shouldMergeHorizontalRects).
 *  - The OUTPUT rect always uses loose bounds.
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
 * ============================================================================
 * Word / Line Boundary Expansion
 * ============================================================================
 *
 * Adapted from Chromium's PDFiumEngine::OnMultipleClick (pdfium-engine.cc lines 1658-1694).
 *
 * Double-click: expand to word boundaries (spaces / empty glyphs).
 * Triple-click: expand to line boundaries (runs on the same visual row).
 */

const VERTICAL_OVERLAP_THRESHOLD_LINE = 0.5;

/**
 * Resolve a character index to the run and local offset within that run.
 */
function resolveCharIndex(
  geo: PdfPageGeometry,
  charIndex: number,
): { runIdx: number; localIdx: number } | null {
  for (let r = 0; r < geo.runs.length; r++) {
    const run = geo.runs[r];
    const localIdx = charIndex - run.charStart;
    if (localIdx >= 0 && localIdx < run.glyphs.length) {
      return { runIdx: r, localIdx };
    }
  }
  return null;
}

/**
 * Check if a glyph acts as a word boundary (space or empty).
 * Mirrors PDFium's `IsWordBoundary(ch)` which returns true for whitespace/punctuation.
 */
function isGlyphWordBoundary(flags: number): boolean {
  return flags === 1 || flags === 2; // 1 = space, 2 = empty
}

/**
 * Expand a character index to the word surrounding it.
 *
 * Walks backward and forward from `charIndex` within the page geometry
 * until a word-boundary glyph (space or empty) is encountered.
 *
 * @returns `{ from, to }` inclusive indices, or null if charIndex is invalid.
 */
export function expandToWordBoundary(
  geo: PdfPageGeometry,
  charIndex: number,
): { from: number; to: number } | null {
  const resolved = resolveCharIndex(geo, charIndex);
  if (!resolved) return null;

  const totalChars = getTotalCharCount(geo);
  if (totalChars === 0) return null;

  // Walk backward
  let from = charIndex;
  while (from > 0) {
    const prev = resolveCharIndex(geo, from - 1);
    if (!prev) break;
    if (isGlyphWordBoundary(geo.runs[prev.runIdx].glyphs[prev.localIdx].flags)) break;
    from--;
  }

  // Walk forward
  let to = charIndex;
  while (to < totalChars - 1) {
    const next = resolveCharIndex(geo, to + 1);
    if (!next) break;
    if (isGlyphWordBoundary(geo.runs[next.runIdx].glyphs[next.localIdx].flags)) break;
    to++;
  }

  return { from, to };
}

/**
 * Expand a character index to the full visual line (row) it belongs to.
 *
 * Finds all runs whose vertical extent overlaps with the run containing `charIndex`,
 * then returns the first-to-last character span across those runs.
 *
 * @returns `{ from, to }` inclusive indices, or null if charIndex is invalid.
 */
export function expandToLineBoundary(
  geo: PdfPageGeometry,
  charIndex: number,
): { from: number; to: number } | null {
  const resolved = resolveCharIndex(geo, charIndex);
  if (!resolved) return null;

  const anchorRun = geo.runs[resolved.runIdx];
  const anchorTop = anchorRun.rect.y;
  const anchorBottom = anchorRun.rect.y + anchorRun.rect.height;

  let from = anchorRun.charStart;
  let to = anchorRun.charStart + anchorRun.glyphs.length - 1;

  // Expand backward through runs on the same visual row
  for (let r = resolved.runIdx - 1; r >= 0; r--) {
    const run = geo.runs[r];
    if (isZeroSizeRun(run)) continue;
    if (!runsOverlapVertically(run.rect.y, run.rect.y + run.rect.height, anchorTop, anchorBottom)) {
      break;
    }
    from = run.charStart;
  }

  // Expand forward through runs on the same visual row
  for (let r = resolved.runIdx + 1; r < geo.runs.length; r++) {
    const run = geo.runs[r];
    if (isZeroSizeRun(run)) continue;
    if (!runsOverlapVertically(run.rect.y, run.rect.y + run.rect.height, anchorTop, anchorBottom)) {
      break;
    }
    to = run.charStart + run.glyphs.length - 1;
  }

  return { from, to };
}

function isZeroSizeRun(run: PdfRun): boolean {
  return run.rect.width === 0 && run.rect.height === 0;
}

function runsOverlapVertically(
  top1: number,
  bottom1: number,
  top2: number,
  bottom2: number,
): boolean {
  const unionHeight = Math.max(bottom1, bottom2) - Math.min(top1, top2);
  const intersectHeight = Math.max(0, Math.min(bottom1, bottom2) - Math.max(top1, top2));
  if (unionHeight === 0) return false;
  return intersectHeight / unionHeight >= VERTICAL_OVERLAP_THRESHOLD_LINE;
}

function getTotalCharCount(geo: PdfPageGeometry): number {
  if (geo.runs.length === 0) return 0;
  const lastRun = geo.runs[geo.runs.length - 1];
  return lastRun.charStart + lastRun.glyphs.length;
}
