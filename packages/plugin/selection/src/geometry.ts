/**
 * The pure selection geometry: engine text geometry (PDF user space, y-up) →
 * viewer content space (y-down), glyph hit-testing, word/line expansion, and the
 * line-merge. No DOM, no engine, no React.
 *
 * ORIENTATION MODEL — selection is horizontal-text math in the text's own
 * frame. Every run belongs to a FRAME: frame 0 is content space itself (all
 * upright runs — the dominant case takes exactly the legacy path), and each
 * rotated orientation cluster gets a frame in which its text reads upright,
 * y-down. Glyph boxes are stored in FRAME space, the battle-tested algorithms
 * below run verbatim on them, and only the boundaries transform: pointer
 * points map INTO a frame (`glyphAt`), merged line rects map OUT as oriented
 * `TextQuad`s (`segmentsForRange`). Runs of different frames never merge into
 * one line — differently-rotated text is never the same visual line.
 *
 * The non-trivial bits are ports of battle-tested algorithms, adapted to v3's
 * content-space `Rect {x,y,width,height}`:
 *   - `glyphAt`     — PDFium `GetIndexAtPos` (exact tight box, then a tolerance pass).
 *   - `segmentsForRange` — Chromium `pdfium_range.cc` `MergeAdjacentRects` (one
 *     segment per visual line), emitting oriented quads + a sequence-derived
 *     advance sign (reading direction is NOT inferred from geometry).
 *   - `expandToWord/Line` — Chromium `OnMultipleClick` (double = word, triple = line).
 * The PDF↔content y-flip is the geometry package's `pageGeometry` (the one place
 * that math lives), never hand-rolled here.
 */
import {
  applyPoint,
  applyRect,
  applyTextQuad,
  boundsOfRects,
  compose,
  invert,
  pageGeometry,
  rotate,
  scale,
  textQuadBounds,
  textQuadFromRect,
  type Mat2D,
  type Point,
  type Rect,
  type RectIn,
  type TextQuad,
} from '@embedpdf/core-geometry';
import {
  isRotatedGeometryRun,
  type PageGeometryRun,
  type PageGeometrySnapshot,
  type PdfQuad,
  type PdfRect,
  type RotatedGeometryRun,
} from '@embedpdf/engine-core/runtime';

const FLAG_SPACE = 1;
const FLAG_EMPTY = 2;
const isBoundary = (flags: number): boolean => (flags & (FLAG_SPACE | FLAG_EMPTY)) !== 0;
const isEmpty = (flags: number): boolean => (flags & FLAG_EMPTY) !== 0;

/** Frames whose baseline angles differ less than this share a cluster (~0.5°). */
const FRAME_ANGLE_TOLERANCE = 0.0087;

/** One glyph in its frame's space. `loose` builds selection rects; `tight` hit-tests. */
export interface GlyphInfo {
  loose: Rect;
  tight?: Rect;
  flags: number;
}

/** A contiguous run of glyphs (a text object). `rect` is its frame-space loose box. */
export interface RunInfo {
  start: number; // index into PageText.glyphs (the selection coordinate)
  count: number;
  rect: Rect;
  fontSize?: number;
  /** Index into {@link PageText.frames}; 0 = content space (upright). */
  frame: number;
}

/** An orientation cluster's transforms. Frame space is y-down with its text upright. */
export interface FrameInfo {
  /** Wire baseline angle (radians, CCW, PDF y-up); 0 for the content frame. */
  theta: number;
  ascentFlip: boolean;
  toContent: Mat2D;
  fromContent: Mat2D;
}

/** A page's text laid out per-frame: a flat glyph list + run structure + frames. */
export interface PageText {
  glyphs: GlyphInfo[];
  runs: RunInfo[];
  frames: FrameInfo[];
}

/**
 * One merged visual line of a selection, in content space. `quad` carries
 * frame-geometric corner semantics (upper = ascent side, start = frame −x);
 * `advance` is the READING direction along the baseline, derived from the
 * glyph sequence (+1 = toward `end`, −1 = toward `start`) — geometry and
 * bidi stay separate concerns. `rect` is the content-space AABB.
 */
export interface SelectionSegment {
  quad: TextQuad;
  rect: Rect;
  advance: 1 | -1;
}

const toContent = (m: Mat2D, b: PdfRect): Rect =>
  applyRect(
    m as never,
    {
      x: b.left,
      y: b.bottom,
      width: b.right - b.left,
      height: b.top - b.bottom,
    } as RectIn<'pdf'>,
  ) as Rect;

const IDENTITY = [1, 0, 0, 1, 0, 0] as Mat2D;

/**
 * Flatten a page's text geometry into frame-space glyphs + runs. Page rotation
 * does NOT enter here — the overlay rides the page's CSS rotation, so frame 0
 * stays un-rotated content space (the crop-relative y-flip is the only
 * conversion), exactly the legacy path for upright documents.
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
  const contentFromPdf = pdfToContent as unknown as Mat2D;
  const pdfFromContent = invert(contentFromPdf as never) as unknown as Mat2D;

  const frames: FrameInfo[] = [
    { theta: 0, ascentFlip: false, toContent: IDENTITY, fromContent: IDENTITY },
  ];
  const frameFor = (run: RotatedGeometryRun): number => {
    for (let i = 1; i < frames.length; i++) {
      const f = frames[i];
      if (f.ascentFlip !== run.ascentFlip) continue;
      const delta = f.theta - run.rotation;
      if (Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= FRAME_ANGLE_TOLERANCE) {
        return i;
      }
    }
    // Frame space: un-rotate the baseline in PDF y-up coords, then point the
    // ascent up-screen (y-down "upper" = smaller y). For mirrored content the
    // ascent already lands at −y after un-rotation, so the flip is skipped.
    const flipY = scale(1, run.ascentFlip ? 1 : -1) as unknown as Mat2D;
    const pdfToFrame = compose(flipY as never, rotate(-run.rotation) as never) as unknown as Mat2D;
    const fromContent = compose(pdfToFrame as never, pdfFromContent as never) as unknown as Mat2D;
    frames.push({
      theta: run.rotation,
      ascentFlip: run.ascentFlip,
      toContent: invert(fromContent as never) as unknown as Mat2D,
      fromContent,
    });
    return frames.length - 1;
  };

  const glyphs: GlyphInfo[] = [];
  const runs: RunInfo[] = [];
  for (const run of snapshot.runs) {
    const start = glyphs.length;
    if (!isRotatedGeometryRun(run)) {
      // Legacy path, verbatim — upright documents build the same PageText
      // (modulo the added frame index) they always did.
      for (const g of run.glyphs) {
        glyphs.push({
          loose: toContent(contentFromPdf, g.looseBox),
          tight: g.tightBox ? toContent(contentFromPdf, g.tightBox) : undefined,
          flags: g.flags,
        });
      }
      runs.push({
        start,
        count: run.glyphs.length,
        rect: toContent(contentFromPdf, run.rect),
        fontSize: run.fontSize,
        frame: 0,
      });
      continue;
    }

    const frame = frameFor(run);
    const pdfToFrame = compose(
      frames[frame].fromContent as never,
      contentFromPdf as never,
    ) as unknown as Mat2D;
    let runBox: Rect | null = null;
    for (const g of run.glyphs) {
      if (isEmpty(g.flags)) {
        glyphs.push({ loose: { x: 0, y: 0, width: 0, height: 0 }, flags: g.flags });
        continue;
      }
      const loose = frameRectOfQuad(pdfToFrame, g.looseQuad);
      const tight = g.tightQuad ? frameRectOfQuad(pdfToFrame, g.tightQuad) : undefined;
      glyphs.push({ loose, tight, flags: g.flags });
      runBox = runBox ? (boundsOfRects([runBox, loose]) ?? runBox) : loose;
    }
    runs.push({
      start,
      count: run.glyphs.length,
      rect: runBox ?? { x: 0, y: 0, width: 0, height: 0 },
      fontSize: run.fontSize,
      frame,
    });
  }
  return { glyphs, runs, frames };
}

/** Frame-space AABB of a page-space glyph cell (exact under pure rotation). */
function frameRectOfQuad(pdfToFrame: Mat2D, quad: PdfQuad): Rect {
  const pts = [quad.p1, quad.p2, quad.p3, quad.p4].map((p) =>
    applyPoint(pdfToFrame as never, p as never),
  ) as Point[];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
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

/** The pointer point expressed in every frame (index-aligned with `text.frames`). */
function pointPerFrame(text: PageText, p: Point): Point[] {
  return text.frames.map((f, i) =>
    i === 0 ? p : (applyPoint(f.fromContent as never, p as never) as Point),
  );
}

/**
 * The glyph index at a content-space point, or null when nothing is near (so the
 * caller can show the pointer cursor off-text). PDFium `GetIndexAtPos`: exact
 * tight-box containment first, then a tolerance pass (closest by Manhattan
 * distance within `toleranceFactor × average glyph height`). Each run tests the
 * point in ITS OWN frame, so rotated text hit-tests exactly.
 */
export function glyphAt(text: PageText, p: Point, toleranceFactor = 1.5): number | null {
  const pts = pointPerFrame(text, p);
  for (const run of text.runs) {
    const q = pts[run.frame];
    const r = run.rect;
    if (q.x < r.x || q.x > r.x + r.width || q.y < r.y || q.y > r.y + r.height) continue;
    for (let i = 0; i < run.count; i++) {
      const b = text.glyphs[run.start + i].tight ?? text.glyphs[run.start + i].loose;
      if (q.x >= b.x && q.x <= b.x + b.width && q.y >= b.y && q.y <= b.y + b.height) {
        return run.start + i;
      }
    }
  }
  if (toleranceFactor <= 0) return null;

  const half = (avgGlyphHeight(text) * toleranceFactor) / 2;
  let best = -1;
  let bestDist = Infinity;
  for (const run of text.runs) {
    const q = pts[run.frame];
    const r = run.rect;
    if (
      q.y < r.y - half ||
      q.y > r.y + r.height + half ||
      q.x < r.x - half ||
      q.x > r.x + r.width + half
    ) {
      continue;
    }
    for (let i = 0; i < run.count; i++) {
      const g = text.glyphs[run.start + i];
      if (isEmpty(g.flags)) continue;
      const b = g.tight ?? g.loose;
      if (
        q.x < b.x - half ||
        q.x > b.x + b.width + half ||
        q.y < b.y - half ||
        q.y > b.y + b.height + half
      ) {
        continue;
      }
      const dx = Math.min(Math.abs(q.x - b.x), Math.abs(q.x - (b.x + b.width)));
      const dy = Math.min(Math.abs(q.y - b.y), Math.abs(q.y - (b.y + b.height)));
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

/** Triple-click: the full visual line — SAME-FRAME runs whose vertical extent
 *  overlaps the anchor run's. A differently-oriented run is a line boundary. */
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
    if (run.frame !== anchor.frame) break;
    if (!overlapV(run.rect.y, run.rect.y + run.rect.height, top, bottom)) break;
    from = run.start;
  }
  for (let r = ri + 1; r < text.runs.length; r++) {
    const run = text.runs[r];
    if (isZero(run.rect)) continue;
    if (run.frame !== anchor.frame) break;
    if (!overlapV(run.rect.y, run.rect.y + run.rect.height, top, bottom)) break;
    to = run.start + run.count - 1;
  }
  return [from, to];
}

/* ── line-merge ────────────────────────────────────────────────────────────
 * Adapted from Chromium's pdf/pdfium/pdfium_range.cc (BSD-licensed,
 * Copyright 2010 The Chromium Authors). Glyphs → sub-runs (split on big intra-run
 * gaps) → merged line segments. Runs verbatim on frame-space rects; only the
 * OUTPUT maps to content space, as oriented quads. */

const CHAR_DISTANCE_FACTOR = 2.5;
const FONT_SIZE_RATIO_THRESHOLD = 1.5;
const VERTICAL_OVERLAP_THRESHOLD = 0.8;
const LINE_OVERLAP_THRESHOLD = 0.5;

interface SubRun {
  rect: Rect;
  charCount: number;
  fontSize?: number;
  frame: number;
  /** Baseline x of the FIRST/LAST glyph in sequence order (frame space) —
   *  the reading-direction signal. */
  firstX: number;
  lastX: number;
}

/** Merged line segments for the inclusive glyph range, in content space. */
export function segmentsForRange(text: PageText, from: number, to: number): SelectionSegment[] {
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
    let firstX = 0;
    let lastX = 0;
    const flush = () => {
      if (minX !== Infinity && charCount > 0) {
        subRuns.push({
          rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          charCount,
          fontSize: run.fontSize,
          frame: run.frame,
          firstX,
          lastX,
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
      const centerX = b.x + b.width / 2;
      if (charCount === 0) firstX = centerX;
      lastX = centerX;
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

  return mergeAdjacentSubRuns(subRuns).map((m) => materializeSegment(text, m));
}

/** Highlight rects for the range — the segments' content-space AABBs. */
export function rectsForRange(text: PageText, from: number, to: number): Rect[] {
  return segmentsForRange(text, from, to).map((s) => s.rect);
}

interface MergedSubRun {
  rect: Rect;
  frame: number;
  firstX: number;
  lastX: number;
}

function mergeAdjacentSubRuns(runs: SubRun[]): MergedSubRun[] {
  const out: MergedSubRun[] = [];
  let prev: SubRun | null = null;
  let cur: MergedSubRun | null = null;
  for (const run of runs) {
    if (prev && cur && prev.frame === run.frame && shouldMerge(prev, run)) {
      cur = {
        rect: boundsOfRects([cur.rect, run.rect])!,
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
  if (cur && cur.rect.width > 0 && cur.rect.height > 0) out.push(cur);
  return out;
}

function materializeSegment(text: PageText, m: MergedSubRun): SelectionSegment {
  const frame = text.frames[m.frame];
  const frameQuad = textQuadFromRect(m.rect);
  const quad =
    m.frame === 0
      ? frameQuad
      : (applyTextQuad(frame.toContent as never, frameQuad as never) as TextQuad);
  return {
    quad,
    rect: m.frame === 0 ? m.rect : textQuadBounds(quad),
    advance: m.lastX >= m.firstX ? 1 : -1,
  };
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
