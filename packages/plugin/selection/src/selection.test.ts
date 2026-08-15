import { describe, expect, it } from 'vitest';
import type { PageGeometrySnapshot, PdfQuad, PdfRect } from '@embedpdf/engine-core/runtime';
import {
  expandTextRangeToLine,
  expandTextRangeToWord,
  textGlyphAt,
  textSegmentsForRange,
} from '@embedpdf/engine-core/runtime';
import {
  buildSelectionPageGeometry,
  contentPointToPdf,
  toContentSegment,
  type SelectionSegment,
} from './geometry';

const crop: PdfRect = { left: 0, bottom: 0, right: 200, top: 100 };

// y-up glyph box helper; `flags` bit 1 = space, bit 2 = empty.
const glyph = (left: number, bottom: number, flags = 0, w = 8, h = 10) => ({
  looseBox: { left, bottom, right: left + w, top: bottom + h },
  flags,
});

// Line A (y-up 90..100): "Hi wo " in run0 (trailing space) + "rl" in run1 (same row).
// Line B (y-up 70..80): "ab" in run2.  Spaces (flag 1) terminate words.
const snapshot: PageGeometrySnapshot = {
  runs: [
    {
      rect: { left: 10, bottom: 90, right: 58, top: 100 },
      charStart: 0,
      glyphs: [
        glyph(10, 90),
        glyph(18, 90),
        glyph(26, 90, 1 /* space */),
        glyph(34, 90),
        glyph(42, 90),
        glyph(50, 90, 1 /* space */),
      ],
    },
    {
      rect: { left: 58, bottom: 90, right: 74, top: 100 },
      charStart: 6,
      glyphs: [glyph(58, 90), glyph(66, 90)],
    },
    {
      rect: { left: 10, bottom: 70, right: 26, top: 80 },
      charStart: 8,
      glyphs: [glyph(10, 70), glyph(18, 70)],
    },
  ],
};

const geom = buildSelectionPageGeometry(snapshot, crop, 0, 1);

/** The seam under test: content pointer in → canonical index; canonical
 *  segments out → content space. */
const glyphAtContent = (p: { x: number; y: number }) =>
  textGlyphAt(geom.layout, contentPointToPdf(geom, p));
const segmentsFor = (from: number, to: number): SelectionSegment[] =>
  textSegmentsForRange(geom.layout, from, to - from + 1).map((s) => toContentSegment(geom, s));

describe('selection geometry seam', () => {
  it('flips PDF y-up into content y-down (crop-aware) and keeps run structure', () => {
    expect(geom.layout.glyphs).toHaveLength(10);
    expect(geom.layout.runs).toHaveLength(3);
    const first = segmentsFor(0, 0);
    expect(first[0].rect).toMatchObject({ x: 10, y: 0, width: 8, height: 10 });
    const lineB = segmentsFor(8, 9);
    expect(lineB[0].rect.y).toBeGreaterThan(first[0].rect.y); // line B below line A
  });

  it('glyphAt: hits over text through the seam, null off-text', () => {
    expect(glyphAtContent({ x: 14, y: 5 })).toBe(0); // inside the first glyph
    expect(glyphAtContent({ x: 500, y: 500 })).toBeNull(); // far away → not over text
  });

  it('expandToWord stops at spaces (double-click)', () => {
    expect(expandTextRangeToWord(geom.layout, 0)).toEqual([0, 1]); // "Hi"
    expect(expandTextRangeToWord(geom.layout, 4)).toEqual([3, 4]); // "wo"
  });

  it('expandToLine spans every run on the visual row (triple-click)', () => {
    expect(expandTextRangeToLine(geom.layout, 1)).toEqual([0, 7]); // run0 + run1 (line A)
    expect(expandTextRangeToLine(geom.layout, 9)).toEqual([8, 9]); // line B only
  });

  it('merges a visual line into one segment (Chromium algorithm)', () => {
    const segments = segmentsFor(0, 9); // whole page
    expect(segments).toHaveLength(2); // line A (run0+run1 merged) + line B
    expect(segments[0].rect).toMatchObject({ x: 10 });
    expect(segments[0].rect.width).toBeCloseTo(64); // spans through run1 (x 10..74)
  });
});

// ── oriented text ──────────────────────────────────────────────────────────

// One glyph cell of a 90°-CCW-rotated column: baseline runs +y (up the page),
// ascent points −x. Frame-geometric slots: p1 US, p2 UE, p3 LS, p4 LE.
const columnGlyph = (yBottom: number, yTop: number): { looseQuad: PdfQuad; flags: number } => ({
  looseQuad: {
    p1: { x: 88, y: yBottom }, // upper-start (ascent side, baseline start)
    p2: { x: 88, y: yTop }, // upper-end
    p3: { x: 100, y: yBottom }, // lower-start (baseline side)
    p4: { x: 100, y: yTop }, // lower-end
  },
  flags: 0,
});

// Upright line (indices 0..1) + a 90° column (indices 2..4) on one page.
const mixedSnapshot: PageGeometrySnapshot = {
  runs: [
    {
      rect: { left: 10, bottom: 90, right: 26, top: 100 },
      charStart: 0,
      glyphs: [glyph(10, 90), glyph(18, 90)],
    },
    {
      rect: { left: 88, bottom: 20, right: 100, top: 44 },
      charStart: 2,
      rotation: Math.PI / 2,
      ascentFlip: false,
      glyphs: [columnGlyph(20, 28), columnGlyph(28, 36), columnGlyph(36, 44)],
    },
  ],
};

const mixed = buildSelectionPageGeometry(mixedSnapshot, crop, 0, 1);
const mixedSegments = (from: number, to: number): SelectionSegment[] =>
  textSegmentsForRange(mixed.layout, from, to - from + 1).map((s) => toContentSegment(mixed, s));

describe('oriented selection through the seam', () => {
  it('selects a 90° column as ONE oriented segment, not an AABB per glyph', () => {
    const segments = mixedSegments(2, 4);
    expect(segments).toHaveLength(1);
    const { quad, rect, advance } = segments[0];
    // Content space (y-down, crop top=100): the column occupies x 88..100,
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

  it('hit-tests rotated glyphs through the seam', () => {
    // Inside the middle column glyph (pdf y 28..36 → content y 64..72).
    expect(textGlyphAt(mixed.layout, contentPointToPdf(mixed, { x: 94, y: 68 }))).toBe(3);
    expect(textGlyphAt(mixed.layout, contentPointToPdf(mixed, { x: 150, y: 20 }))).toBeNull();
  });

  it('triple-click on the column stays within its frame', () => {
    expect(expandTextRangeToLine(mixed.layout, 3)).toEqual([2, 4]);
  });

  it('never merges segments across differently-oriented runs', () => {
    const segments = mixedSegments(0, 4);
    expect(segments).toHaveLength(2);
    expect(segments[0].rect.y).toBeCloseTo(0); // the upright line (content y 0..10)
    expect(segments[1].rect.y).toBeCloseTo(56); // the rotated column
  });

  it('derives the advance sign from the glyph sequence (RTL runs)', () => {
    const rtl: PageGeometrySnapshot = {
      runs: [
        {
          rect: { left: 34, bottom: 90, right: 58, top: 100 },
          charStart: 0,
          glyphs: [glyph(50, 90), glyph(42, 90), glyph(34, 90)],
        },
      ],
    };
    const g = buildSelectionPageGeometry(rtl, crop, 0, 1);
    const segments = textSegmentsForRange(g.layout, 0, 3).map((s) => toContentSegment(g, s));
    expect(segments).toHaveLength(1);
    expect(segments[0].advance).toBe(-1);
    expect(segments[0].rect.x).toBeCloseTo(34);
    expect(segments[0].rect.width).toBeCloseTo(24);
  });
});
