import { describe, expect, it } from 'vitest';
import type { PageGeometrySnapshot, PdfQuad, PdfRect } from '@embedpdf/engine-core/runtime';
import {
  buildPageText,
  expandToLine,
  expandToWord,
  glyphAt,
  rectsForRange,
  segmentsForRange,
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

const text = buildPageText(snapshot, crop, 0, 1);

describe('selection geometry', () => {
  it('flips PDF y-up into content y-down (crop-aware) and keeps run structure', () => {
    expect(text.glyphs).toHaveLength(10);
    expect(text.runs).toHaveLength(3);
    expect(text.glyphs[0].loose).toMatchObject({ x: 10, y: 0, width: 8, height: 10 });
    expect(text.runs[2].rect.y).toBeGreaterThan(text.runs[0].rect.y); // line B below line A
  });

  it('glyphAt: hits over text, returns null off-text (so the cursor reverts to pointer)', () => {
    expect(glyphAt(text, { x: 14, y: 5 })).toBe(0); // inside the first glyph
    expect(glyphAt(text, { x: 500, y: 500 })).toBeNull(); // far away → not over text
  });

  it('expandToWord stops at spaces (double-click)', () => {
    expect(expandToWord(text, 0)).toEqual([0, 1]); // "Hi" — stops before the space at 2
    expect(expandToWord(text, 4)).toEqual([3, 4]); // "wo" — starts after the space
  });

  it('expandToLine spans every run on the visual row (triple-click)', () => {
    expect(expandToLine(text, 1)).toEqual([0, 7]); // run0 + run1 (line A), not line B
    expect(expandToLine(text, 9)).toEqual([8, 9]); // line B only
  });

  it('rectsForRange merges a visual line into one rect (Chromium algorithm)', () => {
    const rects = rectsForRange(text, 0, 9); // whole page
    expect(rects).toHaveLength(2); // line A (run0+run1 merged) + line B
    expect(rects[0]).toMatchObject({ x: 10 }); // line A starts at x=10
    expect(rects[0].width).toBeCloseTo(64); // …spans through run1 (x 10..74)
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

const mixed = buildPageText(mixedSnapshot, crop, 0, 1);

describe('oriented selection geometry', () => {
  it('selects a 90° column as ONE oriented segment, not an AABB per glyph', () => {
    const segments = segmentsForRange(mixed, 2, 4);
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

  it('hit-tests rotated glyphs in their own frame', () => {
    // Inside the middle column glyph (pdf y 28..36 → content y 64..72).
    expect(glyphAt(mixed, { x: 94, y: 68 })).toBe(3);
    // Still misses off-text points.
    expect(glyphAt(mixed, { x: 150, y: 20 })).toBeNull();
  });

  it('triple-click on the column stays within its frame', () => {
    expect(expandToLine(mixed, 3)).toEqual([2, 4]);
  });

  it('never merges segments across differently-oriented runs', () => {
    const segments = segmentsForRange(mixed, 0, 4);
    expect(segments).toHaveLength(2);
    expect(segments[0].rect.y).toBeCloseTo(0); // the upright line (content y 0..10)
    expect(segments[1].rect.y).toBeCloseTo(56); // the rotated column
  });

  it('derives the advance sign from the glyph sequence (RTL runs)', () => {
    // Logical order right-to-left: PDFium's bidi keeps reading order in the
    // sequence while x positions decrease. Geometry stays symmetric; only
    // the advance sign reports direction.
    const rtl: PageGeometrySnapshot = {
      runs: [
        {
          rect: { left: 34, bottom: 90, right: 58, top: 100 },
          charStart: 0,
          glyphs: [glyph(50, 90), glyph(42, 90), glyph(34, 90)],
        },
      ],
    };
    const segments = segmentsForRange(buildPageText(rtl, crop, 0, 1), 0, 2);
    expect(segments).toHaveLength(1);
    expect(segments[0].advance).toBe(-1);
    expect(segments[0].rect.x).toBeCloseTo(34);
    expect(segments[0].rect.width).toBeCloseTo(24);
  });
});
