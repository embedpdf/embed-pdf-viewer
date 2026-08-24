import {
  isRotatedGeometryRun,
  type PageGeometrySnapshot,
  type RotatedGeometryRun,
} from '../dto/PageGeometrySnapshot';
import type { PdfPoint, PdfQuad, PdfRect } from '../geometry/primitives';

/**
 * The canonical text-interaction layout — the ONE place glyph geometry
 * becomes hit targets, word/line ranges, and visual-line segments.
 *
 * Selection owns gestures and state; search owns matching and cursors;
 * NEITHER owns segmentation. Both consume this module, so a text range has
 * exactly one canonical segmentation regardless of how it was produced, and
 * coordinate conversion (PDF → content/view) happens strictly afterward at
 * the plugin seam.
 *
 * Everything here is PDF user space (y-up), the engine's one geometry
 * vocabulary. The line-merge is adapted from Chromium's
 * pdf/pdfium/pdfium_range.cc `MergeAdjacentRects` (BSD-licensed, Copyright
 * 2010 The Chromium Authors); hit-testing mirrors PDFium `GetIndexAtPos`
 * (exact tight box first, then a tolerance pass).
 *
 * ORIENTATION MODEL — frames. Every run belongs to a FRAME: frame 0 is page
 * space itself (all upright runs — the dominant case takes a byte-identical
 * fast path), and each rotated orientation cluster gets an orthonormal frame
 * in which its text reads upright (baseline +x, ascent +y). Frames are
 * derived from the SEMANTIC EDGES of the first classifiable glyph's quad —
 * never from advisory wire fields — and keyed by (baseline direction,
 * ascent handedness):
 *
 *   - Rotated and mirrored text become upright inside their frame.
 *   - Shear (fake italic) is deliberately NOT part of the frame key or the
 *     basis: a sheared run shares the frame of its unsheared neighbours, so
 *     a mixed roman/italic line merges into ONE segment (Acrobat parity),
 *     and the shear is absorbed as a small in-frame AABB residue. This is
 *     the deterministic, order-independent contract — an affine
 *     (shear-preserving) basis would either fragment mixed lines or make
 *     the roman body's geometry depend on whether an italic run came first.
 *   - Runs of different frames never merge into one line.
 *
 * All algorithms run on frame-local boxes; every participating run of a
 * cluster is transformed through the SAME frame, so merged coordinates are
 * always commensurable. Only the output maps back to page space, as
 * oriented quads.
 */

const FLAG_SPACE = 1;
const FLAG_EMPTY = 2;
const isBoundary = (flags: number): boolean => (flags & (FLAG_SPACE | FLAG_EMPTY)) !== 0;
const isEmpty = (flags: number): boolean => (flags & FLAG_EMPTY) !== 0;

const CHAR_DISTANCE_FACTOR = 2.5;
const FONT_SIZE_RATIO_THRESHOLD = 1.5;
const VERTICAL_OVERLAP_THRESHOLD = 0.8;
const LINE_OVERLAP_THRESHOLD = 0.5;
/** Baseline directions within ~0.5° share a frame. */
const FRAME_DOT_TOLERANCE = Math.cos(0.0087);
const EDGE_EPSILON = 1e-6;

/**
 * One merged visual line of a text range, in PDF user space. `quad` is the
 * geometric authority (frame-geometric slot order: `p1..p4` = upper-start,
 * upper-end, lower-start, lower-end — visual semantics, NOT reading order);
 * `rect` is its axis-aligned bounds, produced by the same constructor.
 * `advance` is the READING direction along the baseline, derived from the
 * glyph SEQUENCE (+1 = the frame's +x), never inferred from geometry.
 */
export interface PdfTextSegment {
  quad: PdfQuad;
  rect: PdfRect;
  advance: 1 | -1;
}

/** One glyph in its frame's space. `loose` builds segments; `tight` hit-tests. */
export interface TextLayoutGlyph {
  loose: PdfRect;
  tight?: PdfRect;
  flags: number;
}

/** A contiguous run of glyphs (a text object) in one frame. */
export interface TextLayoutRun {
  /** First char index — identical to the flat glyph index (runs tile the page). */
  charStart: number;
  count: number;
  /** Frame-local loose box (page space itself in frame 0). */
  rect: PdfRect;
  fontSize?: number;
  /** Index into {@link PageTextLayout.frames}; 0 = page space (upright). */
  frame: number;
}

/** An orientation cluster's orthonormal basis in page space. */
export interface TextLayoutFrame {
  /** Unit vector along the reading baseline (+x of the frame). */
  baseline: PdfPoint;
  /** Unit vector toward the ascent side (+y of the frame), ⟂ baseline. */
  ascent: PdfPoint;
}

/**
 * A page's text laid out per-frame: a flat glyph list (index = text-page
 * char index), the run structure, and the orientation frames.
 */
export interface PageTextLayout {
  glyphs: TextLayoutGlyph[];
  runs: TextLayoutRun[];
  frames: TextLayoutFrame[];
}

const IDENTITY_FRAME: TextLayoutFrame = { baseline: { x: 1, y: 0 }, ascent: { x: 0, y: 1 } };

const toFrame = (f: TextLayoutFrame, p: PdfPoint): PdfPoint => ({
  x: p.x * f.baseline.x + p.y * f.baseline.y,
  y: p.x * f.ascent.x + p.y * f.ascent.y,
});

const fromFrame = (f: TextLayoutFrame, p: PdfPoint): PdfPoint => ({
  x: f.baseline.x * p.x + f.ascent.x * p.y,
  y: f.baseline.y * p.x + f.ascent.y * p.y,
});

const ZERO_RECT: PdfRect = { left: 0, bottom: 0, right: 0, top: 0 };

/** Frame-local AABB of a page-space cell (exact under the frame's rotation;
 *  shear residue is the documented in-frame envelope). */
function frameBoxOfQuad(f: TextLayoutFrame, q: PdfQuad): PdfRect {
  const pts = [q.p1, q.p2, q.p3, q.p4].map((p) => toFrame(f, p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    left: Math.min(...xs),
    bottom: Math.min(...ys),
    right: Math.max(...xs),
    top: Math.max(...ys),
  };
}

/** Find-or-create the frame for a rotated run, keyed by the baseline
 *  direction + ascent handedness of its first classifiable glyph's edges. */
function frameForRun(frames: TextLayoutFrame[], run: RotatedGeometryRun): number {
  const seed = run.glyphs.find((g) => !isEmpty(g.flags));
  if (!seed) return 0;
  const q = seed.looseQuad;
  const bx = q.p2.x - q.p1.x;
  const by = q.p2.y - q.p1.y;
  const len = Math.hypot(bx, by);
  if (len <= EDGE_EPSILON) return 0;
  const baseline: PdfPoint = { x: bx / len, y: by / len };
  // Handedness from the actual ascent edge (lower-start → upper-start), so
  // mirrored text gets its own frame with "up" on its true ascent side.
  const ax = q.p1.x - q.p3.x;
  const ay = q.p1.y - q.p3.y;
  const sign = baseline.x * ay - baseline.y * ax >= 0 ? 1 : -1;
  const ascent: PdfPoint = { x: -baseline.y * sign, y: baseline.x * sign };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const dot = f.baseline.x * baseline.x + f.baseline.y * baseline.y;
    const sameHandedness = f.ascent.x * ascent.x + f.ascent.y * ascent.y > 0;
    if (dot >= FRAME_DOT_TOLERANCE && sameHandedness) return i;
  }
  frames.push({ baseline, ascent });
  return frames.length - 1;
}

/**
 * Flatten a page's geometry snapshot into the canonical layout. Upright runs
 * copy their wire boxes verbatim (frame 0 — byte-identical to the
 * pre-orientation behavior, wire run rects included); rotated runs project
 * their glyph cells into their cluster's frame.
 */
export function buildPageTextLayout(snapshot: PageGeometrySnapshot): PageTextLayout {
  const glyphs: TextLayoutGlyph[] = [];
  const runs: TextLayoutRun[] = [];
  const frames: TextLayoutFrame[] = [IDENTITY_FRAME];

  for (const run of snapshot.runs) {
    if (!isRotatedGeometryRun(run)) {
      for (const g of run.glyphs) {
        glyphs.push({ loose: g.looseBox, tight: g.tightBox, flags: g.flags });
      }
      runs.push({
        charStart: run.charStart,
        count: run.glyphs.length,
        rect: run.rect,
        fontSize: run.fontSize,
        frame: 0,
      });
      continue;
    }

    const frame = frameForRun(frames, run);
    const f = frames[frame];
    let runBox: PdfRect | null = null;
    for (const g of run.glyphs) {
      if (isEmpty(g.flags)) {
        glyphs.push({ loose: ZERO_RECT, flags: g.flags });
        continue;
      }
      const loose = frameBoxOfQuad(f, g.looseQuad);
      const tight = g.tightQuad ? frameBoxOfQuad(f, g.tightQuad) : undefined;
      glyphs.push({ loose, tight, flags: g.flags });
      runBox = runBox
        ? {
            left: Math.min(runBox.left, loose.left),
            bottom: Math.min(runBox.bottom, loose.bottom),
            right: Math.max(runBox.right, loose.right),
            top: Math.max(runBox.top, loose.top),
          }
        : loose;
    }
    runs.push({
      charStart: run.charStart,
      count: run.glyphs.length,
      rect: runBox ?? ZERO_RECT,
      fontSize: run.fontSize,
      frame,
    });
  }
  return { glyphs, runs, frames };
}

const inRect = (r: PdfRect, p: PdfPoint): boolean =>
  p.x >= r.left && p.x <= r.right && p.y >= r.bottom && p.y <= r.top;

function avgGlyphHeight(layout: PageTextLayout): number {
  let total = 0;
  let count = 0;
  for (const g of layout.glyphs) {
    if (isEmpty(g.flags)) continue;
    total += g.loose.top - g.loose.bottom;
    count++;
  }
  return count === 0 ? 0 : total / count;
}

/** The point expressed in every frame (index-aligned with `layout.frames`).
 *  Frame 0 returns the point itself — no float round-trip on the fast path. */
function pointPerFrame(layout: PageTextLayout, p: PdfPoint): PdfPoint[] {
  return layout.frames.map((f, i) => (i === 0 ? p : toFrame(f, p)));
}

/**
 * The glyph (char) index at a page-space point, or null when nothing is near
 * (so callers can show the pointer cursor off-text). PDFium `GetIndexAtPos`:
 * exact tight-box containment first, then a tolerance pass (closest by
 * Manhattan distance within `toleranceFactor × average glyph height`). Each
 * run tests the point in ITS OWN frame, so rotated text hit-tests exactly.
 */
export function textGlyphAt(
  layout: PageTextLayout,
  point: PdfPoint,
  toleranceFactor = 1.5,
): number | null {
  const pts = pointPerFrame(layout, point);
  for (const run of layout.runs) {
    const q = pts[run.frame];
    if (!inRect(run.rect, q)) continue;
    for (let i = 0; i < run.count; i++) {
      const g = layout.glyphs[run.charStart + i];
      if (inRect(g.tight ?? g.loose, q)) return run.charStart + i;
    }
  }
  if (toleranceFactor <= 0) return null;

  const half = (avgGlyphHeight(layout) * toleranceFactor) / 2;
  let best = -1;
  let bestDist = Infinity;
  for (const run of layout.runs) {
    const q = pts[run.frame];
    const r = run.rect;
    if (
      q.x < r.left - half ||
      q.x > r.right + half ||
      q.y < r.bottom - half ||
      q.y > r.top + half
    ) {
      continue;
    }
    for (let i = 0; i < run.count; i++) {
      const g = layout.glyphs[run.charStart + i];
      if (isEmpty(g.flags)) continue;
      const b = g.tight ?? g.loose;
      if (
        q.x < b.left - half ||
        q.x > b.right + half ||
        q.y < b.bottom - half ||
        q.y > b.top + half
      ) {
        continue;
      }
      const dx = Math.min(Math.abs(q.x - b.left), Math.abs(q.x - b.right));
      const dy = Math.min(Math.abs(q.y - b.bottom), Math.abs(q.y - b.top));
      if (dx + dy < bestDist) {
        bestDist = dx + dy;
        best = run.charStart + i;
      }
    }
  }
  return best >= 0 ? best : null;
}

/** Double-click: the word around `glyph` (walk to space/empty glyphs both ways). */
export function expandTextRangeToWord(layout: PageTextLayout, glyph: number): [number, number] {
  const n = layout.glyphs.length;
  if (glyph < 0 || glyph >= n) return [glyph, glyph];
  let from = glyph;
  while (from > 0 && !isBoundary(layout.glyphs[from - 1].flags)) from--;
  let to = glyph;
  while (to < n - 1 && !isBoundary(layout.glyphs[to + 1].flags)) to++;
  return [from, to];
}

/** Triple-click: the full visual line — SAME-FRAME runs whose vertical extent
 *  overlaps the anchor run's. A differently-oriented run is a line boundary. */
export function expandTextRangeToLine(layout: PageTextLayout, glyph: number): [number, number] {
  const ri = layout.runs.findIndex((r) => glyph >= r.charStart && glyph < r.charStart + r.count);
  if (ri < 0) return [glyph, glyph];
  const anchor = layout.runs[ri];
  const bottom = anchor.rect.bottom;
  const top = anchor.rect.top;
  let from = anchor.charStart;
  let to = anchor.charStart + anchor.count - 1;
  for (let r = ri - 1; r >= 0; r--) {
    const run = layout.runs[r];
    if (isZero(run.rect)) continue;
    if (run.frame !== anchor.frame) break;
    if (!overlapV(run.rect.bottom, run.rect.top, bottom, top)) break;
    from = run.charStart;
  }
  for (let r = ri + 1; r < layout.runs.length; r++) {
    const run = layout.runs[r];
    if (isZero(run.rect)) continue;
    if (run.frame !== anchor.frame) break;
    if (!overlapV(run.rect.bottom, run.rect.top, bottom, top)) break;
    to = run.charStart + run.count - 1;
  }
  return [from, to];
}

/**
 * A single glyph's oriented cell in page space, or null for degenerate
 * glyphs — the anchor for caret placement at a selection boundary.
 */
export function textGlyphQuad(layout: PageTextLayout, glyph: number): PdfQuad | null {
  const g = layout.glyphs[glyph];
  if (!g || isEmpty(g.flags)) return null;
  const b = g.loose;
  if (b.right <= b.left || b.top <= b.bottom) return null;
  const run = layout.runs.find((r) => glyph >= r.charStart && glyph < r.charStart + r.count);
  const f = layout.frames[run?.frame ?? 0];
  return quadOfFrameRect(f, run?.frame ?? 0, b);
}

interface SubRun {
  rect: PdfRect;
  charCount: number;
  fontSize?: number;
  frame: number;
  /** Baseline x of the FIRST/LAST glyph in sequence order (frame space) —
   *  the reading-direction signal. */
  firstX: number;
  lastX: number;
}

/**
 * Merged visual-line segments for the half-open char range
 * `[charStart, charStart + charCount)` — THE canonical segmentation. Chars
 * outside the layout are ignored.
 */
export function textSegmentsForRange(
  layout: PageTextLayout,
  charStart: number,
  charCount: number,
): PdfTextSegment[] {
  if (charCount <= 0 || layout.glyphs.length === 0) return [];
  const lo = Math.max(0, charStart);
  const hi = Math.min(layout.glyphs.length - 1, charStart + charCount - 1);
  if (hi < lo) return [];
  const subRuns: SubRun[] = [];

  for (const run of layout.runs) {
    const runEnd = run.charStart + run.count - 1;
    if (runEnd < lo || run.charStart > hi) continue;
    const s = Math.max(lo, run.charStart);
    const e = Math.min(hi, runEnd);

    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    let charCountAcc = 0;
    let widthSum = 0;
    let prevRight = -Infinity;
    let firstX = 0;
    let lastX = 0;
    const flush = () => {
      if (charCountAcc > 0 && left !== Infinity) {
        subRuns.push({
          rect: { left, bottom, right, top },
          charCount: charCountAcc,
          fontSize: run.fontSize,
          frame: run.frame,
          firstX,
          lastX,
        });
      }
      left = Infinity;
      right = -Infinity;
      bottom = Infinity;
      top = -Infinity;
      charCountAcc = 0;
      widthSum = 0;
      prevRight = -Infinity;
    };

    for (let ci = s; ci <= e; ci++) {
      const g = layout.glyphs[ci];
      if (isEmpty(g.flags)) continue;
      const b = g.loose;
      if (charCountAcc > 0 && prevRight > -Infinity) {
        const avg = widthSum / charCountAcc;
        if (avg > 0 && Math.abs(b.left - prevRight) > CHAR_DISTANCE_FACTOR * avg) flush();
      }
      const centerX = (b.left + b.right) / 2;
      if (charCountAcc === 0) firstX = centerX;
      lastX = centerX;
      left = Math.min(left, b.left);
      right = Math.max(right, b.right);
      bottom = Math.min(bottom, b.bottom);
      top = Math.max(top, b.top);
      charCountAcc++;
      widthSum += b.right - b.left;
      prevRight = b.right;
    }
    flush();
  }

  return mergeAdjacentSubRuns(subRuns).map((m) => materializeSegment(layout, m));
}

interface MergedSubRun {
  rect: PdfRect;
  frame: number;
  firstX: number;
  lastX: number;
}

function mergeAdjacentSubRuns(runs: SubRun[]): MergedSubRun[] {
  const out: MergedSubRun[] = [];
  let prev: SubRun | null = null;
  let cur: MergedSubRun | null = null;
  for (const run of runs) {
    // Frames are canonical per cluster, so index equality IS the "same
    // orientation" test — every participant was projected through the SAME
    // frame, keeping merged coordinates commensurable.
    if (prev && cur && prev.frame === run.frame && shouldMerge(prev, run)) {
      cur = {
        rect: {
          left: Math.min(cur.rect.left, run.rect.left),
          bottom: Math.min(cur.rect.bottom, run.rect.bottom),
          right: Math.max(cur.rect.right, run.rect.right),
          top: Math.max(cur.rect.top, run.rect.top),
        },
        frame: cur.frame,
        firstX: cur.firstX,
        lastX: run.lastX,
      };
    } else {
      if (cur) out.push(cur);
      cur = { rect: run.rect, frame: run.frame, firstX: run.firstX, lastX: run.lastX };
    }
    prev = run;
  }
  if (cur && cur.rect.right > cur.rect.left && cur.rect.top > cur.rect.bottom) out.push(cur);
  return out;
}

/** Segment quad for a frame-local rect (frame 0: the rect's own corners,
 *  no float round-trip). Slot order US, UE, LS, LE; frame is y-up, so the
 *  upper corners sit at the frame TOP. */
function quadOfFrameRect(f: TextLayoutFrame, frameIndex: number, r: PdfRect): PdfQuad {
  if (frameIndex === 0) {
    return {
      p1: { x: r.left, y: r.top },
      p2: { x: r.right, y: r.top },
      p3: { x: r.left, y: r.bottom },
      p4: { x: r.right, y: r.bottom },
    };
  }
  return {
    p1: fromFrame(f, { x: r.left, y: r.top }),
    p2: fromFrame(f, { x: r.right, y: r.top }),
    p3: fromFrame(f, { x: r.left, y: r.bottom }),
    p4: fromFrame(f, { x: r.right, y: r.bottom }),
  };
}

function materializeSegment(layout: PageTextLayout, m: MergedSubRun): PdfTextSegment {
  const frame = layout.frames[m.frame];
  const quad = quadOfFrameRect(frame, m.frame, m.rect);
  const rect =
    m.frame === 0
      ? m.rect
      : {
          left: Math.min(quad.p1.x, quad.p2.x, quad.p3.x, quad.p4.x),
          bottom: Math.min(quad.p1.y, quad.p2.y, quad.p3.y, quad.p4.y),
          right: Math.max(quad.p1.x, quad.p2.x, quad.p3.x, quad.p4.x),
          top: Math.max(quad.p1.y, quad.p2.y, quad.p3.y, quad.p4.y),
        };
  return { quad, rect, advance: m.lastX >= m.firstX ? 1 : -1 };
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

function verticalOverlap(a: PdfRect, b: PdfRect): number {
  const ah = a.top - a.bottom;
  const bh = b.top - b.bottom;
  if (ah <= 0 || bh <= 0) return 0;
  const u = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
  if (u === ah || u === bh) return 1;
  const i = Math.max(0, Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom));
  return i / u;
}

const isZero = (r: PdfRect): boolean => r.right === r.left && r.top === r.bottom;

function overlapV(bottom1: number, top1: number, bottom2: number, top2: number): boolean {
  const u = Math.max(top1, top2) - Math.min(bottom1, bottom2);
  if (u === 0) return false;
  const i = Math.max(0, Math.min(top1, top2) - Math.max(bottom1, bottom2));
  return i / u >= LINE_OVERLAP_THRESHOLD;
}
