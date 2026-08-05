import type { PageGeometrySnapshot } from '../dto/PageGeometrySnapshot';
import type { PdfRect } from '../geometry/primitives';

/**
 * Match-range → merged line rects, in PDF user space (y-up).
 *
 * This is the same line-merge text selection uses (adapted from Chromium's
 * pdf/pdfium/pdfium_range.cc `MergeAdjacentRects`, BSD-licensed, Copyright
 * 2010 The Chromium Authors), operating directly on the engine's
 * `PageGeometrySnapshot`: glyph loose boxes → sub-runs (split on big
 * intra-run gaps) → one rect per visual line. Search highlights therefore
 * look exactly like selections — never a rect per glyph (the v2 bug).
 *
 * It lives in engine-core because BOTH sides need it: the server computes
 * rects here for `'rects'`-mode responses (geometry never leaves the trust
 * boundary), and the local engine computes them in the worker.
 */

const FLAG_EMPTY = 2;

const CHAR_DISTANCE_FACTOR = 2.5;
const FONT_SIZE_RATIO_THRESHOLD = 1.5;
const VERTICAL_OVERLAP_THRESHOLD = 0.8;

interface SubRun {
  rect: PdfRect;
  charCount: number;
  fontSize?: number;
}

/**
 * Merged line rects for the text-page char range
 * `[charStart, charStart + charCount)`. Ranges index the same space as
 * `PageGeometryRun.charStart`; chars outside the snapshot are ignored.
 */
export function searchRectsForRange(
  snapshot: PageGeometrySnapshot,
  charStart: number,
  charCount: number,
): PdfRect[] {
  if (charCount <= 0) return [];
  const lo = charStart;
  const hi = charStart + charCount - 1;
  const subRuns: SubRun[] = [];

  for (const run of snapshot.runs) {
    const runEnd = run.charStart + run.glyphs.length - 1;
    if (runEnd < lo || run.charStart > hi) continue;
    const s = Math.max(lo, run.charStart);
    const e = Math.min(hi, runEnd);

    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    let count = 0;
    let widthSum = 0;
    let prevRight = -Infinity;
    const flush = () => {
      if (count > 0 && right > left && top > bottom) {
        subRuns.push({
          rect: { left, bottom, right, top },
          charCount: count,
          fontSize: run.fontSize,
        });
      }
      left = Infinity;
      right = -Infinity;
      bottom = Infinity;
      top = -Infinity;
      count = 0;
      widthSum = 0;
      prevRight = -Infinity;
    };

    for (let ci = s; ci <= e; ci++) {
      const g = run.glyphs[ci - run.charStart];
      if ((g.flags & FLAG_EMPTY) !== 0) continue;
      const b = g.looseBox;
      if (count > 0 && prevRight > -Infinity) {
        const avg = widthSum / count;
        if (avg > 0 && Math.abs(b.left - prevRight) > CHAR_DISTANCE_FACTOR * avg) flush();
      }
      left = Math.min(left, b.left);
      right = Math.max(right, b.right);
      bottom = Math.min(bottom, b.bottom);
      top = Math.max(top, b.top);
      count++;
      widthSum += b.right - b.left;
      prevRight = b.right;
    }
    flush();
  }

  return mergeAdjacentRects(subRuns);
}

function mergeAdjacentRects(runs: SubRun[]): PdfRect[] {
  const out: PdfRect[] = [];
  let prev: SubRun | null = null;
  let cur: PdfRect | null = null;
  for (const run of runs) {
    if (prev && cur && shouldMerge(prev, run)) {
      cur = union(cur, run.rect);
    } else {
      if (cur) out.push(cur);
      cur = run.rect;
    }
    prev = run;
  }
  if (cur) out.push(cur);
  return out;
}

function shouldMerge(a: SubRun, b: SubRun): boolean {
  if (a.fontSize != null && b.fontSize != null && a.fontSize > 0 && b.fontSize > 0) {
    const ratio = Math.max(a.fontSize, b.fontSize) / Math.min(a.fontSize, b.fontSize);
    if (ratio > FONT_SIZE_RATIO_THRESHOLD) return false;
  }
  if (verticalOverlap(a.rect, b.rect) < VERTICAL_OVERLAP_THRESHOLD) return false;
  const aw = (a.rect.right - a.rect.left) / a.charCount;
  const bw = (b.rect.right - b.rect.left) / b.charCount;
  const aL = a.rect.left - aw;
  const aR = a.rect.right + aw;
  const bL = b.rect.left - bw;
  const bR = b.rect.right + bw;
  return aL < bR && aR > bL;
}

function union(a: PdfRect, b: PdfRect): PdfRect {
  return {
    left: Math.min(a.left, b.left),
    bottom: Math.min(a.bottom, b.bottom),
    right: Math.max(a.right, b.right),
    top: Math.max(a.top, b.top),
  };
}

function verticalOverlap(a: PdfRect, b: PdfRect): number {
  const ah = a.top - a.bottom;
  const bh = b.top - b.bottom;
  if (ah <= 0 || bh <= 0) return 0;
  const u = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
  if (u === ah || u === bh) return 1;
  const i = Math.max(0, Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom));
  return i / u;
}
