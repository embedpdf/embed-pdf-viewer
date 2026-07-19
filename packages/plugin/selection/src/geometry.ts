/**
 * The pure selection geometry: engine text geometry (PDF user space, y-up) →
 * viewer content space (y-down), glyph hit-testing, word/line expansion, and the
 * line-merge. No DOM, no engine, no React.
 *
 * The non-trivial bits are ports of battle-tested algorithms, adapted to v3's
 * content-space `Rect {x,y,width,height}`:
 *   - `glyphAt`     — PDFium `GetIndexAtPos` (exact tight box, then a tolerance pass).
 *   - `rectsForRange` — Chromium `pdfium_range.cc` `MergeAdjacentRects` (one rect per line).
 *   - `expandToWord/Line` — Chromium `OnMultipleClick` (double = word, triple = line).
 * The PDF↔content y-flip is the geometry package's `pageGeometry` (the one place
 * that math lives), never hand-rolled here.
 */
import {
  applyRect,
  boundsOfRects,
  pageGeometry,
  type Point,
  type Rect,
  type RectIn,
} from '@embedpdf/core-geometry';
import type { PageGeometrySnapshot, PdfRect } from '@embedpdf/engine-core/runtime';

const FLAG_SPACE = 1;
const FLAG_EMPTY = 2;
const isBoundary = (flags: number): boolean => (flags & (FLAG_SPACE | FLAG_EMPTY)) !== 0;
const isEmpty = (flags: number): boolean => (flags & FLAG_EMPTY) !== 0;

/** One glyph in content space. `loose` builds selection rects; `tight` hit-tests. */
export interface GlyphInfo {
  loose: Rect;
  tight?: Rect;
  flags: number;
}

/** A contiguous run of glyphs (a text object). `rect` is its loose enclosing box. */
export interface RunInfo {
  start: number; // index into PageText.glyphs (the selection coordinate)
  count: number;
  rect: Rect;
  fontSize?: number;
}

/** A page's text laid out in content space: a flat glyph list + the run structure. */
export interface PageText {
  glyphs: GlyphInfo[];
  runs: RunInfo[];
}

const toContent = (m: Parameters<typeof applyRect>[0], b: PdfRect): Rect =>
  applyRect(
    m as never,
    {
      x: b.left,
      y: b.bottom,
      width: b.right - b.left,
      height: b.top - b.bottom,
    } as RectIn<'pdf'>,
  ) as Rect;

/**
 * Flatten a page's text geometry into content-space glyphs + runs. Rotation does
 * NOT enter here — the overlay rides the page's CSS rotation, so glyphs stay in
 * un-rotated content space (the crop-relative y-flip is the only conversion).
 */
export function buildPageText(
  snapshot: PageGeometrySnapshot,
  crop: PdfRect,
  rotation: 0 | 90 | 180 | 270,
  userUnit: number,
): PageText {
  // zoom = 1: pdfToContent is scale-free (just the y-flip); the viewer's zoom is
  // applied later by PageTransform.pageToContent, not baked in.
  const { pdfToContent } = pageGeometry({ crop, rotation, userUnit }, 1);
  const glyphs: GlyphInfo[] = [];
  const runs: RunInfo[] = [];
  for (const run of snapshot.runs) {
    const start = glyphs.length;
    for (const g of run.glyphs) {
      glyphs.push({
        loose: toContent(pdfToContent, g.looseBox),
        tight: g.tightBox ? toContent(pdfToContent, g.tightBox) : undefined,
        flags: g.flags,
      });
    }
    runs.push({
      start,
      count: run.glyphs.length,
      rect: toContent(pdfToContent, run.rect),
      fontSize: run.fontSize,
    });
  }
  return { glyphs, runs };
}

function avgGlyphHeight(text: PageText): number {
  let total = 0;
  let count = 0;
  for (const g of text.glyphs) {
    if (isEmpty(g.flags)) continue;
    total += g.loose.height;
    count++;
  }
  return count === 0 ? 0 : total / count;
}

/**
 * The glyph index at a content-space point, or null when nothing is near (so the
 * caller can show the pointer cursor off-text). PDFium `GetIndexAtPos`: exact
 * tight-box containment first, then a tolerance pass (closest by Manhattan
 * distance within `toleranceFactor × average glyph height`).
 */
export function glyphAt(text: PageText, p: Point, toleranceFactor = 1.5): number | null {
  for (const run of text.runs) {
    const r = run.rect;
    if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height) continue;
    for (let i = 0; i < run.count; i++) {
      const b = text.glyphs[run.start + i].tight ?? text.glyphs[run.start + i].loose;
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) {
        return run.start + i;
      }
    }
  }
  if (toleranceFactor <= 0) return null;

  const half = (avgGlyphHeight(text) * toleranceFactor) / 2;
  let best = -1;
  let bestDist = Infinity;
  for (const run of text.runs) {
    const r = run.rect;
    if (
      p.y < r.y - half ||
      p.y > r.y + r.height + half ||
      p.x < r.x - half ||
      p.x > r.x + r.width + half
    ) {
      continue;
    }
    for (let i = 0; i < run.count; i++) {
      const g = text.glyphs[run.start + i];
      if (isEmpty(g.flags)) continue;
      const b = g.tight ?? g.loose;
      if (
        p.x < b.x - half ||
        p.x > b.x + b.width + half ||
        p.y < b.y - half ||
        p.y > b.y + b.height + half
      ) {
        continue;
      }
      const dx = Math.min(Math.abs(p.x - b.x), Math.abs(p.x - (b.x + b.width)));
      const dy = Math.min(Math.abs(p.y - b.y), Math.abs(p.y - (b.y + b.height)));
      if (dx + dy < bestDist) {
        bestDist = dx + dy;
        best = run.start + i;
      }
    }
  }
  return best >= 0 ? best : null;
}

/** Double-click: the word around `i` (walk to space/empty glyphs both ways). */
export function expandToWord(text: PageText, i: number): [number, number] {
  const n = text.glyphs.length;
  if (i < 0 || i >= n) return [i, i];
  let from = i;
  while (from > 0 && !isBoundary(text.glyphs[from - 1].flags)) from--;
  let to = i;
  while (to < n - 1 && !isBoundary(text.glyphs[to + 1].flags)) to++;
  return [from, to];
}

/** Triple-click: the full visual line — runs whose vertical extent overlaps the anchor run's. */
export function expandToLine(text: PageText, i: number): [number, number] {
  const ri = text.runs.findIndex((r) => i >= r.start && i < r.start + r.count);
  if (ri < 0) return [i, i];
  const anchor = text.runs[ri];
  const top = anchor.rect.y;
  const bottom = anchor.rect.y + anchor.rect.height;
  let from = anchor.start;
  let to = anchor.start + anchor.count - 1;
  for (let r = ri - 1; r >= 0; r--) {
    const run = text.runs[r];
    if (isZero(run.rect)) continue;
    if (!overlapV(run.rect.y, run.rect.y + run.rect.height, top, bottom)) break;
    from = run.start;
  }
  for (let r = ri + 1; r < text.runs.length; r++) {
    const run = text.runs[r];
    if (isZero(run.rect)) continue;
    if (!overlapV(run.rect.y, run.rect.y + run.rect.height, top, bottom)) break;
    to = run.start + run.count - 1;
  }
  return [from, to];
}

/* ── line-merge ────────────────────────────────────────────────────────────
 * Adapted from Chromium's pdf/pdfium/pdfium_range.cc (BSD-licensed,
 * Copyright 2010 The Chromium Authors). Glyphs → sub-runs (split on big intra-run
 * gaps) → merged line rects. */

const CHAR_DISTANCE_FACTOR = 2.5;
const FONT_SIZE_RATIO_THRESHOLD = 1.5;
const VERTICAL_OVERLAP_THRESHOLD = 0.8;
const LINE_OVERLAP_THRESHOLD = 0.5;

interface SubRun {
  rect: Rect;
  charCount: number;
  fontSize?: number;
}

export function rectsForRange(text: PageText, from: number, to: number): Rect[] {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(text.glyphs.length - 1, Math.max(from, to));
  const subRuns: SubRun[] = [];

  for (const run of text.runs) {
    const runEnd = run.start + run.count - 1;
    if (runEnd < lo || run.start > hi) continue;
    const s = Math.max(lo, run.start);
    const e = Math.min(hi, runEnd);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let charCount = 0;
    let widthSum = 0;
    let prevRight = -Infinity;
    const flush = () => {
      if (minX !== Infinity && charCount > 0) {
        subRuns.push({
          rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          charCount,
          fontSize: run.fontSize,
        });
      }
      minX = Infinity;
      maxX = -Infinity;
      minY = Infinity;
      maxY = -Infinity;
      charCount = 0;
      widthSum = 0;
      prevRight = -Infinity;
    };

    for (let gi = s; gi <= e; gi++) {
      const g = text.glyphs[gi];
      if (isEmpty(g.flags)) continue;
      const b = g.loose;
      if (charCount > 0 && prevRight > -Infinity) {
        const avg = widthSum / charCount;
        if (avg > 0 && Math.abs(b.x - prevRight) > CHAR_DISTANCE_FACTOR * avg) flush();
      }
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.width);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y + b.height);
      charCount++;
      widthSum += b.width;
      prevRight = b.x + b.width;
    }
    flush();
  }

  return mergeAdjacentRects(subRuns);
}

function mergeAdjacentRects(runs: SubRun[]): Rect[] {
  const out: Rect[] = [];
  let prev: SubRun | null = null;
  let cur: Rect | null = null;
  for (const run of runs) {
    if (prev && cur && shouldMerge(prev, run)) {
      cur = boundsOfRects([cur, run.rect])!;
    } else {
      if (cur) out.push(cur);
      cur = run.rect;
    }
    prev = run;
  }
  if (cur && cur.width > 0 && cur.height > 0) out.push(cur);
  return out;
}

function shouldMerge(a: SubRun, b: SubRun): boolean {
  if (a.fontSize != null && b.fontSize != null && a.fontSize > 0 && b.fontSize > 0) {
    const ratio = Math.max(a.fontSize, b.fontSize) / Math.min(a.fontSize, b.fontSize);
    if (ratio > FONT_SIZE_RATIO_THRESHOLD) return false;
  }
  if (verticalOverlap(a.rect, b.rect) < VERTICAL_OVERLAP_THRESHOLD) return false;
  const aw = a.rect.width / a.charCount;
  const bw = b.rect.width / b.charCount;
  const aL = a.rect.x - aw;
  const aR = a.rect.x + a.rect.width + aw;
  const bL = b.rect.x - bw;
  const bR = b.rect.x + b.rect.width + bw;
  return aL < bR && aR > bL;
}

function verticalOverlap(a: Rect, b: Rect): number {
  if (a.height <= 0 || b.height <= 0) return 0;
  const u = Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y);
  if (u === a.height || u === b.height) return 1;
  const i = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return i / u;
}

const isZero = (r: Rect): boolean => r.width === 0 && r.height === 0;

function overlapV(top1: number, bottom1: number, top2: number, bottom2: number): boolean {
  const u = Math.max(bottom1, bottom2) - Math.min(top1, top2);
  if (u === 0) return false;
  const i = Math.max(0, Math.min(bottom1, bottom2) - Math.max(top1, top2));
  return i / u >= LINE_OVERLAP_THRESHOLD;
}
