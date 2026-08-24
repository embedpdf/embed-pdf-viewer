import { describe, expect, test } from 'vitest';
import {
  buildPageTextLayout,
  expandTextRangeToLine,
  expandTextRangeToWord,
  textGlyphAt,
  textGlyphQuad,
  textSegmentsForRange,
} from '../../src/text/layout';
import type { PdfTextSegment } from '../../src/text/layout';
import type {
  PageGeometryRun,
  PageGeometrySnapshot,
  PdfPoint,
  PdfQuad,
  PdfRect,
  RotatedGeometryGlyph,
} from '../../src/shared';

/* ── fixture builders ────────────────────────────────────────────────────── */

const uprightGlyph = (x: number, opts: { w?: number; bottom?: number; flags?: number } = {}) => ({
  looseBox: {
    left: x,
    right: x + (opts.w ?? 10),
    bottom: opts.bottom ?? 100,
    top: (opts.bottom ?? 100) + 10,
  },
  flags: opts.flags ?? 0,
});

function uprightRun(
  charStart: number,
  glyphs: ReturnType<typeof uprightGlyph>[],
  fontSize?: number,
): PageGeometryRun {
  const rect = glyphs.reduce(
    (acc, g) => ({
      left: Math.min(acc.left, g.looseBox.left),
      right: Math.max(acc.right, g.looseBox.right),
      bottom: Math.min(acc.bottom, g.looseBox.bottom),
      top: Math.max(acc.top, g.looseBox.top),
    }),
    { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity },
  );
  return { rect, charStart, glyphs, fontSize };
}

/** A run of glyph cells along an arbitrary baseline. `origin` is the first
 *  cell's lower-start corner; û the baseline unit; n̂ the ascent unit. */
function orientedRun(
  charStart: number,
  origin: PdfPoint,
  u: PdfPoint,
  n: PdfPoint,
  opts: { count?: number; w?: number; h?: number; rotation: number; shear?: number },
): PageGeometryRun {
  const count = opts.count ?? 3;
  const w = opts.w ?? 8;
  const h = opts.h ?? 12;
  const shear = opts.shear ?? 0;
  const glyphs: RotatedGeometryGlyph[] = [];
  const at = (t: number, up: number): PdfPoint => ({
    x: origin.x + u.x * t + n.x * up + u.x * shear * (up / h),
    y: origin.y + u.y * t + n.y * up + u.y * shear * (up / h),
  });
  for (let i = 0; i < count; i++) {
    const t = i * w;
    glyphs.push({
      looseQuad: {
        p1: at(t, h), // upper-start
        p2: at(t + w, h), // upper-end
        p3: at(t, 0), // lower-start
        p4: at(t + w, 0), // lower-end
      },
      flags: 0,
    });
  }
  const xs = glyphs.flatMap((g) => [g.looseQuad.p1, g.looseQuad.p2, g.looseQuad.p3, g.looseQuad.p4]);
  const rect = xs.reduce(
    (acc, p) => ({
      left: Math.min(acc.left, p.x),
      right: Math.max(acc.right, p.x),
      bottom: Math.min(acc.bottom, p.y),
      top: Math.max(acc.top, p.y),
    }),
    { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity },
  );
  return { rect, charStart, rotation: opts.rotation, ascentFlip: false, glyphs };
}

const snapshot = (...runs: PageGeometryRun[]): PageGeometrySnapshot => ({ runs });

const boundsOfQuad = (q: PdfQuad): PdfRect => ({
  left: Math.min(q.p1.x, q.p2.x, q.p3.x, q.p4.x),
  bottom: Math.min(q.p1.y, q.p2.y, q.p3.y, q.p4.y),
  right: Math.max(q.p1.x, q.p2.x, q.p3.x, q.p4.x),
  top: Math.max(q.p1.y, q.p2.y, q.p3.y, q.p4.y),
});

const expectRectEqualsBounds = (segments: PdfTextSegment[]) => {
  for (const s of segments) {
    const b = boundsOfQuad(s.quad);
    expect(s.rect.left).toBeCloseTo(b.left, 6);
    expect(s.rect.right).toBeCloseTo(b.right, 6);
    expect(s.rect.bottom).toBeCloseTo(b.bottom, 6);
    expect(s.rect.top).toBeCloseTo(b.top, 6);
  }
};

const R2 = Math.SQRT1_2; // cos/sin 45°

/* ── upright behavior (the byte-identity gate) ───────────────────────────── */

describe('canonical layout — upright', () => {
  const line = (charStart: number, x: number, bottom = 100, fontSize?: number) =>
    uprightRun(
      charStart,
      [0, 1, 2, 3, 4].map((i) => uprightGlyph(x + i * 10, { bottom })),
      fontSize,
    );

  test('adjacent text objects on one line merge into one segment', () => {
    const layout = buildPageTextLayout(snapshot(line(0, 10), line(5, 60)));
    const segments = textSegmentsForRange(layout, 0, 10);
    expect(segments).toHaveLength(1);
    expect(segments[0].rect).toEqual({ left: 10, right: 110, bottom: 100, top: 110 });
    // Upright quads are the rect's own corners (US, UE, LS, LE — y-up).
    expect(segments[0].quad.p1).toEqual({ x: 10, y: 110 });
    expect(segments[0].quad.p4).toEqual({ x: 110, y: 100 });
    expect(segments[0].advance).toBe(1);
    expectRectEqualsBounds(segments);
  });

  test('large intra-run gaps split; separate lines never merge', () => {
    const gappy = uprightRun(0, [
      uprightGlyph(10),
      uprightGlyph(20),
      uprightGlyph(200), // gap ≫ 2.5 × avg width
      uprightGlyph(210),
    ]);
    const other = line(4, 10, 60);
    const layout = buildPageTextLayout(snapshot(gappy, other));
    const segments = textSegmentsForRange(layout, 0, 9);
    expect(segments).toHaveLength(3);
  });

  test('empty glyphs contribute nothing; the range is half-open', () => {
    const layout = buildPageTextLayout(
      snapshot(
        uprightRun(0, [uprightGlyph(10), uprightGlyph(20, { flags: 2 }), uprightGlyph(30)]),
      ),
    );
    expect(textSegmentsForRange(layout, 0, 0)).toHaveLength(0);
    const firstTwo = textSegmentsForRange(layout, 0, 2); // glyphs 0..1 only
    expect(firstTwo).toHaveLength(1);
    expect(firstTwo[0].rect.right).toBe(20); // the empty glyph added nothing
    const all = textSegmentsForRange(layout, 0, 3);
    expect(all[0].rect).toEqual({ left: 10, right: 40, bottom: 100, top: 110 });
  });

  test('font-size ratio and vertical overlap still gate merging', () => {
    const big = uprightRun(0, [uprightGlyph(10), uprightGlyph(20)], 20);
    const small = uprightRun(2, [uprightGlyph(40), uprightGlyph(50)], 8);
    const layout = buildPageTextLayout(snapshot(big, small));
    expect(textSegmentsForRange(layout, 0, 4)).toHaveLength(2);
  });

  test('RTL glyph sequences report advance −1 with unchanged geometry', () => {
    const rtl = uprightRun(0, [uprightGlyph(50), uprightGlyph(42, { w: 8 }), uprightGlyph(34, { w: 8 })]);
    const layout = buildPageTextLayout(snapshot(rtl));
    const segments = textSegmentsForRange(layout, 0, 3);
    expect(segments).toHaveLength(1);
    expect(segments[0].advance).toBe(-1);
    expect(segments[0].rect.left).toBe(34);
  });
});

/* ── oriented behavior ───────────────────────────────────────────────────── */

describe('canonical layout — oriented', () => {
  // 90°-CCW column: baseline +y, ascent −x. Cells x 88..100, y 20..44.
  const column = orientedRun(
    0,
    { x: 100, y: 20 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { rotation: Math.PI / 2, w: 8, h: 12 },
  );

  test('a 90° column is one exact oriented segment', () => {
    const layout = buildPageTextLayout(snapshot(column));
    const segments = textSegmentsForRange(layout, 0, 3);
    expect(segments).toHaveLength(1);
    const q = segments[0].quad;
    expect(q.p1.x).toBeCloseTo(88, 6); // upper-start
    expect(q.p1.y).toBeCloseTo(20, 6);
    expect(q.p2.x).toBeCloseTo(88, 6); // upper-end
    expect(q.p2.y).toBeCloseTo(44, 6);
    expect(q.p3.x).toBeCloseTo(100, 6); // lower-start
    expect(q.p3.y).toBeCloseTo(20, 6);
    expect(segments[0].rect.left).toBeCloseTo(88, 6);
    expect(segments[0].rect.top).toBeCloseTo(44, 6);
    expect(segments[0].advance).toBe(1);
    expectRectEqualsBounds(segments);
  });

  test('45° text produces the exact rotated cell union, not an AABB blob', () => {
    const diagonal = orientedRun(
      0,
      { x: 60, y: 20 },
      { x: R2, y: R2 },
      { x: -R2, y: R2 },
      { rotation: Math.PI / 4, w: 8, h: 12, count: 4 },
    );
    const layout = buildPageTextLayout(snapshot(diagonal));
    const segments = textSegmentsForRange(layout, 0, 4);
    expect(segments).toHaveLength(1);
    const q = segments[0].quad;
    const first = (diagonal.glyphs as RotatedGeometryGlyph[])[0].looseQuad;
    const last = (diagonal.glyphs as RotatedGeometryGlyph[])[3].looseQuad;
    expect(q.p1.x).toBeCloseTo(first.p1.x, 5);
    expect(q.p1.y).toBeCloseTo(first.p1.y, 5);
    expect(q.p2.x).toBeCloseTo(last.p2.x, 5);
    expect(q.p2.y).toBeCloseTo(last.p2.y, 5);
    expect(q.p3.x).toBeCloseTo(first.p3.x, 5);
    expect(q.p4.x).toBeCloseTo(last.p4.x, 5);
    expectRectEqualsBounds(segments);
  });

  test('mirrored text keeps semantic corners and forward advance', () => {
    // Horizontal mirror: baseline −x, ascent +y. Logical order advances
    // visually leftward; inside ITS frame that is still +x.
    const mirrored = orientedRun(
      0,
      { x: 90, y: 100 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { rotation: Math.PI, w: 8, h: 12 },
    );
    const layout = buildPageTextLayout(snapshot(mirrored));
    const segments = textSegmentsForRange(layout, 0, 3);
    expect(segments).toHaveLength(1);
    const q = segments[0].quad;
    // upper-start sits at the VISUAL right — the mirror is part of the frame.
    expect(q.p1.x).toBeCloseTo(90, 6);
    expect(q.p2.x).toBeCloseTo(66, 6);
    expect(q.p1.y).toBeCloseTo(112, 6);
    expect(segments[0].advance).toBe(1);
    expectRectEqualsBounds(segments);
  });

  test('mixed roman + fake-italic on one line merges into ONE segment', () => {
    const roman = uprightRun(0, [uprightGlyph(10), uprightGlyph(20)]);
    // Shear-only run (rotation 0): baseline (1,0), sheared ascent — shares
    // frame 0 with the roman text by design; the shear is in-frame residue.
    const italic = orientedRun(
      2,
      { x: 30, y: 100 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { rotation: 0, w: 10, h: 10, count: 2, shear: 2.5 },
    );
    const layout = buildPageTextLayout(snapshot(roman, italic));
    expect(layout.runs[0].frame).toBe(0);
    expect(layout.runs[1].frame).toBe(0); // ← the clustering contract
    const segments = textSegmentsForRange(layout, 0, 4);
    expect(segments).toHaveLength(1);
    expect(segments[0].rect.left).toBe(10);
    expect(segments[0].rect.right).toBeCloseTo(52.5, 6); // shear residue included
    expectRectEqualsBounds(segments);
  });

  test('differently oriented runs never merge; near angles share one frame', () => {
    const line = uprightRun(0, [uprightGlyph(84), uprightGlyph(94)], undefined);
    const layout = buildPageTextLayout(snapshot(line, { ...column, charStart: 2 }));
    const segments = textSegmentsForRange(layout, 0, 5);
    expect(segments).toHaveLength(2);

    const a = orientedRun(0, { x: 60, y: 20 }, { x: R2, y: R2 }, { x: -R2, y: R2 }, {
      rotation: Math.PI / 4,
      count: 2,
    });
    const delta = 0.005; // within the 0.5° cluster tolerance
    const u2 = { x: Math.cos(Math.PI / 4 + delta), y: Math.sin(Math.PI / 4 + delta) };
    const n2 = { x: -u2.y, y: u2.x };
    const b = orientedRun(2, { x: 71.4, y: 31.2 }, u2, n2, {
      rotation: Math.PI / 4 + delta,
      count: 2,
    });
    const near = buildPageTextLayout(snapshot(a, b));
    expect(near.runs[0].frame).toBe(near.runs[1].frame); // one canonical frame

    const far = buildPageTextLayout(
      snapshot(a, { ...orientedRun(2, { x: 75, y: 35 }, { x: Math.cos(Math.PI / 4 + 0.05), y: Math.sin(Math.PI / 4 + 0.05) }, { x: -Math.sin(Math.PI / 4 + 0.05), y: Math.cos(Math.PI / 4 + 0.05) }, { rotation: Math.PI / 4 + 0.05, count: 2 }) }),
    );
    expect(far.runs[0].frame).not.toBe(far.runs[1].frame);
  });
});

/* ── hit-testing and range expansion ─────────────────────────────────────── */

describe('canonical layout — interaction', () => {
  const column = orientedRun(
    2,
    { x: 100, y: 20 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { rotation: Math.PI / 2, w: 8, h: 12 },
  );
  const layout = buildPageTextLayout(
    snapshot(uprightRun(0, [uprightGlyph(10), uprightGlyph(18, { flags: 1 })]), column),
  );

  test('textGlyphAt hits upright and rotated glyphs in their own frames', () => {
    expect(textGlyphAt(layout, { x: 14, y: 105 })).toBe(0);
    // middle column glyph: baseline span y 28..36, cell x 88..100
    expect(textGlyphAt(layout, { x: 94, y: 32 })).toBe(3);
    expect(textGlyphAt(layout, { x: 300, y: 300 })).toBeNull();
  });

  test('word expansion stops at boundary flags', () => {
    expect(expandTextRangeToWord(layout, 0)).toEqual([0, 0]); // space at 1 ends the word
    expect(expandTextRangeToWord(layout, 3)).toEqual([2, 4]);
  });

  test('line expansion stays within the anchor frame', () => {
    expect(expandTextRangeToLine(layout, 3)).toEqual([2, 4]);
  });

  test('textGlyphQuad returns the oriented cell for endpoints', () => {
    const q = textGlyphQuad(layout, 2);
    expect(q).not.toBeNull();
    expect(q!.p1.x).toBeCloseTo(88, 6);
    expect(q!.p1.y).toBeCloseTo(20, 6);
    expect(q!.p4.x).toBeCloseTo(100, 6);
    expect(q!.p4.y).toBeCloseTo(28, 6);
    expect(textGlyphQuad(layout, 1)).not.toBeNull(); // spaces still have cells
  });
});
