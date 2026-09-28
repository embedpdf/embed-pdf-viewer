import { describe, expect, it } from 'vitest';
import type {
  PageGeometryGlyph,
  PageGeometrySnapshot,
  PdfCoordinates,
  PdfRect,
  RotatedGeometryGlyph,
  TextLayout,
} from '@embedpdf/engine-core/runtime';
import { createTextLayout, pageGeometryOf } from '@embedpdf/engine-core/runtime';
import { selectionSegmentOf, type SelectionSegment } from '../src/geometry';

const crop: PdfRect = { left: 0, bottom: 0, right: 200, top: 100 };

// The fixtures are written in the file's coordinates (y up) and measured on
// the page the way the engine hands them out.
const layoutOf = (snapshot: PageGeometrySnapshot<PdfCoordinates>): TextLayout =>
  createTextLayout(pageGeometryOf(snapshot, crop));
const segmentsOf = (layout: TextLayout, from: number, to: number): SelectionSegment[] =>
  layout.segments({ start: from, count: to - from + 1 }).map(selectionSegmentOf);

// y-up glyph box helper.
const glyph = (
  left: number,
  bottom: number,
  space = false,
  width = 8,
  height = 10,
): PageGeometryGlyph<PdfCoordinates> => ({
  loose: { left, bottom, right: left + width, top: bottom + height },
  ...(space ? { space: true } : {}),
});

// Line A (y-up 90..100): "Hi wo " in run0 (trailing space) + "rl" in run1 (same row).
// Line B (y-up 70..80): "ab" in run2.  Spaces terminate words.
const snapshot: PageGeometrySnapshot<PdfCoordinates> = {
  runs: [
    {
      rect: { left: 10, bottom: 90, right: 58, top: 100 },
      start: 0,
      glyphs: [
        glyph(10, 90),
        glyph(18, 90),
        glyph(26, 90, true /* space */),
        glyph(34, 90),
        glyph(42, 90),
        glyph(50, 90, true /* space */),
      ],
    },
    {
      rect: { left: 58, bottom: 90, right: 74, top: 100 },
      start: 6,
      glyphs: [glyph(58, 90), glyph(66, 90)],
    },
    {
      rect: { left: 10, bottom: 70, right: 26, top: 80 },
      start: 8,
      glyphs: [glyph(10, 70), glyph(18, 70)],
    },
  ],
};

const layout = layoutOf(snapshot);

/** Page-space pointer in → canonical index; canonical segments out, ready to draw. */
const glyphAtContent = (point: { x: number; y: number }) => layout.charAt(point);
const segmentsFor = (from: number, to: number) => segmentsOf(layout, from, to);

describe('selection geometry', () => {
  it('reads page space (y down, from the crop top) and keeps run structure', () => {
    expect(layout.charCount).toBe(10);
    expect(layout.runs).toHaveLength(3);
    const first = segmentsFor(0, 0);
    expect(first[0].rect).toMatchObject({ x: 10, y: 0, width: 8, height: 10 });
    const lineB = segmentsFor(8, 9);
    expect(lineB[0].rect.y).toBeGreaterThan(first[0].rect.y); // line B below line A
  });

  it('glyphAt: hits over text, null off-text', () => {
    expect(glyphAtContent({ x: 14, y: 5 })).toBe(0); // inside the first glyph
    expect(glyphAtContent({ x: 500, y: 500 })).toBeNull(); // far away → not over text
  });

  it('expandToWord stops at spaces (double-click)', () => {
    expect(layout.wordAt(0)).toEqual({ start: 0, count: 2 }); // "Hi"
    expect(layout.wordAt(4)).toEqual({ start: 3, count: 2 }); // "wo"
  });

  it('expandToLine spans every run on the visual row (triple-click)', () => {
    expect(layout.lineAt(1)).toEqual({ start: 0, count: 8 }); // run0 + run1 (line A)
    expect(layout.lineAt(9)).toEqual({ start: 8, count: 2 }); // line B only
  });

  it('merges a visual line into one segment (Chromium algorithm)', () => {
    const segments = segmentsFor(0, 9); // whole page
    expect(segments).toHaveLength(2); // line A (run0+run1 merged) + line B
    expect(segments[0].rect).toMatchObject({ x: 10 });
    expect(segments[0].rect.width).toBeCloseTo(64); // spans through run1 (x 10..74)
  });
});

// ── oriented text ──────────────────────────────────────────────────────────

// One glyph cell of a column rotated 90° counter-clockwise: the baseline runs
// +y (up the page), ascent points −x. Frame-geometric slots: p1 upper-start,
// p2 upper-end, p3 lower-start, p4 lower-end.
const columnGlyph = (yBottom: number, yTop: number): RotatedGeometryGlyph<PdfCoordinates> => ({
  loose: {
    p1: { x: 88, y: yBottom }, // upper-start (ascent side, baseline start)
    p2: { x: 88, y: yTop }, // upper-end
    p3: { x: 100, y: yBottom }, // lower-start (baseline side)
    p4: { x: 100, y: yTop }, // lower-end
  },
});

// Upright line (indices 0..1) + a 90° column (indices 2..4) on one page.
const mixedSnapshot: PageGeometrySnapshot<PdfCoordinates> = {
  runs: [
    {
      rect: { left: 10, bottom: 90, right: 26, top: 100 },
      start: 0,
      glyphs: [glyph(10, 90), glyph(18, 90)],
    },
    {
      rect: { left: 88, bottom: 20, right: 100, top: 44 },
      start: 2,
      rotation: 270,
      ascentFlip: false,
      glyphs: [columnGlyph(20, 28), columnGlyph(28, 36), columnGlyph(36, 44)],
    },
  ],
};

const mixed = layoutOf(mixedSnapshot);
const mixedSegments = (from: number, to: number) => segmentsOf(mixed, from, to);

describe('oriented selection', () => {
  it('selects a 90° column as one oriented segment, not an AABB per glyph', () => {
    const segments = mixedSegments(2, 4);
    expect(segments).toHaveLength(1);
    const { quad, rect, advance } = segments[0];
    // Page space (y-down, crop top=100): the column occupies x 88..100,
    // y 56..80, reading bottom-of-screen → top-of-screen.
    expect(quad.upperStart.x).toBeCloseTo(88);
    expect(quad.upperStart.y).toBeCloseTo(80);
    expect(quad.upperEnd.x).toBeCloseTo(88);
    expect(quad.upperEnd.y).toBeCloseTo(56);
    expect(quad.lowerStart.x).toBeCloseTo(100);
    expect(quad.lowerStart.y).toBeCloseTo(80);
    expect(rect.x).toBeCloseTo(88);
    expect(rect.y).toBeCloseTo(56);
    expect(rect.width).toBeCloseTo(12);
    expect(rect.height).toBeCloseTo(24);
    expect(advance).toBe(1);
  });

  it('hit-tests rotated glyphs', () => {
    // Inside the middle column glyph (file y 28..36 → page y 64..72).
    expect(mixed.charAt({ x: 94, y: 68 })).toBe(3);
    expect(mixed.charAt({ x: 150, y: 20 })).toBeNull();
  });

  it('triple-click on the column stays within its frame', () => {
    expect(mixed.lineAt(3)).toEqual({ start: 2, count: 3 });
  });

  it('never merges segments across differently-oriented runs', () => {
    const segments = mixedSegments(0, 4);
    expect(segments).toHaveLength(2);
    expect(segments[0].rect.y).toBeCloseTo(0); // the upright line (content y 0..10)
    expect(segments[1].rect.y).toBeCloseTo(56); // the rotated column
  });

  it('derives the advance sign from the glyph sequence (RTL runs)', () => {
    const rtl: PageGeometrySnapshot<PdfCoordinates> = {
      runs: [
        {
          rect: { left: 34, bottom: 90, right: 58, top: 100 },
          start: 0,
          glyphs: [glyph(50, 90), glyph(42, 90), glyph(34, 90)],
        },
      ],
    };
    const segments = segmentsOf(layoutOf(rtl), 0, 2);
    expect(segments).toHaveLength(1);
    expect(segments[0].advance).toBe(-1);
    expect(segments[0].rect.x).toBeCloseTo(34);
    expect(segments[0].rect.width).toBeCloseTo(24);
  });
});
