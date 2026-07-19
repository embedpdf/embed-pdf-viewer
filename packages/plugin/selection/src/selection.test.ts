import { describe, expect, it } from 'vitest';
import type { PageGeometrySnapshot, PdfRect } from '@embedpdf/engine-core/runtime';
import { buildPageText, expandToLine, expandToWord, glyphAt, rectsForRange } from './geometry';

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
