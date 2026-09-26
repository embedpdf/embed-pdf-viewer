import { describe, expect, test } from 'vitest';
import { createTextLayout } from '../../src/text/layout';
import type { PdfTextSegment } from '../../src/text/layout';
import type {
  PageGeometryGlyph,
  PageGeometryRun,
  PageGeometrySnapshot,
  PdfPoint,
  PdfQuad,
  PdfRect,
  RotatedGeometryGlyph,
} from '../../src/shared';

/* ── fixture builders ────────────────────────────────────────────────────── */

const uprightGlyph = (
  x: number,
  opts: { w?: number; bottom?: number; space?: true; empty?: true } = {},
): PageGeometryGlyph => ({
  loose: {
    left: x,
    right: x + (opts.w ?? 10),
    bottom: opts.bottom ?? 100,
    top: (opts.bottom ?? 100) + 10,
  },
  ...(opts.space ? { space: true } : {}),
  ...(opts.empty ? { empty: true } : {}),
});

function uprightRun(
  start: number,
  glyphs: PageGeometryGlyph[],
  fontSize?: number,
): PageGeometryRun {
  const rect = glyphs.reduce(
    (acc, g) => ({
      left: Math.min(acc.left, g.loose.left),
      right: Math.max(acc.right, g.loose.right),
      bottom: Math.min(acc.bottom, g.loose.bottom),
      top: Math.max(acc.top, g.loose.top),
    }),
    { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity },
  );
  return { rect, start, glyphs, fontSize };
}

/** A run of glyph cells along an arbitrary baseline. `origin` is the first
 *  cell's lower-start corner; û the baseline unit; n̂ the ascent unit. */
function orientedRun(
  start: number,
  origin: PdfPoint,
  u: PdfPoint,
  n: PdfPoint,
  opts: { count?: number; w?: number; h?: number; baselineAngle: number; shear?: number },
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
      loose: {
        p1: at(t, h), // upper-start
        p2: at(t + w, h), // upper-end
        p3: at(t, 0), // lower-start
        p4: at(t + w, 0), // lower-end
      },
    });
  }
  const xs = glyphs.flatMap((g) => [g.loose.p1, g.loose.p2, g.loose.p3, g.loose.p4]);
  const rect = xs.reduce(
    (acc, p) => ({
      left: Math.min(acc.left, p.x),
      right: Math.max(acc.right, p.x),
      bottom: Math.min(acc.bottom, p.y),
      top: Math.max(acc.top, p.y),
    }),
    { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity },
  );
  return { rect, start, baselineAngle: opts.baselineAngle, ascentFlip: false, glyphs };
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
  const line = (start: number, x: number, bottom = 100, fontSize?: number) =>
    uprightRun(
      start,
      [0, 1, 2, 3, 4].map((i) => uprightGlyph(x + i * 10, { bottom })),
      fontSize,
    );

  test('adjacent text objects on one line merge into one segment', () => {
    const layout = createTextLayout(snapshot(line(0, 10), line(5, 60)));
    const segments = layout.segments({ start: 0, count: 10 });
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
    const layout = createTextLayout(snapshot(gappy, other));
    const segments = layout.segments({ start: 0, count: 9 });
    expect(segments).toHaveLength(3);
  });

  test('empty glyphs contribute nothing; the range is half-open', () => {
    const layout = createTextLayout(
      snapshot(
        uprightRun(0, [uprightGlyph(10), uprightGlyph(20, { empty: true }), uprightGlyph(30)]),
      ),
    );
    expect(layout.segments({ start: 0, count: 0 })).toHaveLength(0);
    const firstTwo = layout.segments({ start: 0, count: 2 }); // glyphs 0..1 only
    expect(firstTwo).toHaveLength(1);
    expect(firstTwo[0].rect.right).toBe(20); // the empty glyph added nothing
    const all = layout.segments({ start: 0, count: 3 });
    expect(all[0].rect).toEqual({ left: 10, right: 40, bottom: 100, top: 110 });
  });

  test('font-size ratio and vertical overlap still gate merging', () => {
    const big = uprightRun(0, [uprightGlyph(10), uprightGlyph(20)], 20);
    const small = uprightRun(2, [uprightGlyph(40), uprightGlyph(50)], 8);
    const layout = createTextLayout(snapshot(big, small));
    expect(layout.segments({ start: 0, count: 4 })).toHaveLength(2);
  });

  test('RTL glyph sequences report advance −1 with unchanged geometry', () => {
    const rtl = uprightRun(0, [
      uprightGlyph(50),
      uprightGlyph(42, { w: 8 }),
      uprightGlyph(34, { w: 8 }),
    ]);
    const layout = createTextLayout(snapshot(rtl));
    const segments = layout.segments({ start: 0, count: 3 });
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
    { baselineAngle: Math.PI / 2, w: 8, h: 12 },
  );

  test('a 90° column is one exact oriented segment', () => {
    const layout = createTextLayout(snapshot(column));
    const segments = layout.segments({ start: 0, count: 3 });
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
      { baselineAngle: Math.PI / 4, w: 8, h: 12, count: 4 },
    );
    const layout = createTextLayout(snapshot(diagonal));
    const segments = layout.segments({ start: 0, count: 4 });
    expect(segments).toHaveLength(1);
    const q = segments[0].quad;
    const first = (diagonal.glyphs as RotatedGeometryGlyph[])[0].loose;
    const last = (diagonal.glyphs as RotatedGeometryGlyph[])[3].loose;
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
    // visually leftward; inside its frame that is still +x.
    const mirrored = orientedRun(
      0,
      { x: 90, y: 100 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { baselineAngle: Math.PI, w: 8, h: 12 },
    );
    const layout = createTextLayout(snapshot(mirrored));
    const segments = layout.segments({ start: 0, count: 3 });
    expect(segments).toHaveLength(1);
    const q = segments[0].quad;
    // upper-start sits at the visual right — the mirror is part of the frame.
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
      { baselineAngle: 0, w: 10, h: 10, count: 2, shear: 2.5 },
    );
    const layout = createTextLayout(snapshot(roman, italic));
    // One segment: the italic run shares the roman run's frame (the clustering contract).
    const segments = layout.segments({ start: 0, count: 4 });
    expect(segments).toHaveLength(1);
    expect(segments[0].rect.left).toBe(10);
    expect(segments[0].rect.right).toBeCloseTo(52.5, 6); // shear residue included
    expectRectEqualsBounds(segments);
  });

  test('differently oriented runs never merge; near angles share one frame', () => {
    const line = uprightRun(0, [uprightGlyph(84), uprightGlyph(94)], undefined);
    const layout = createTextLayout(snapshot(line, { ...column, start: 2 }));
    const segments = layout.segments({ start: 0, count: 5 });
    expect(segments).toHaveLength(2);

    const a = orientedRun(
      0,
      { x: 60, y: 20 },
      { x: R2, y: R2 },
      { x: -R2, y: R2 },
      {
        baselineAngle: Math.PI / 4,
        count: 2,
      },
    );
    const delta = 0.005; // within the 0.5° cluster tolerance
    const u2 = { x: Math.cos(Math.PI / 4 + delta), y: Math.sin(Math.PI / 4 + delta) };
    const n2 = { x: -u2.y, y: u2.x };
    const b = orientedRun(2, { x: 71.4, y: 31.2 }, u2, n2, {
      baselineAngle: Math.PI / 4 + delta,
      count: 2,
    });
    const near = createTextLayout(snapshot(a, b));
    // One canonical frame: the two runs merge into one line.
    expect(near.segments({ start: 0, count: 4 })).toHaveLength(1);

    const far = createTextLayout(
      snapshot(a, {
        ...orientedRun(
          2,
          { x: 75, y: 35 },
          { x: Math.cos(Math.PI / 4 + 0.05), y: Math.sin(Math.PI / 4 + 0.05) },
          { x: -Math.sin(Math.PI / 4 + 0.05), y: Math.cos(Math.PI / 4 + 0.05) },
          { baselineAngle: Math.PI / 4 + 0.05, count: 2 },
        ),
      }),
    );
    // Different frames never merge.
    expect(far.segments({ start: 0, count: 4 })).toHaveLength(2);
  });
});

/* ── hit-testing and range expansion ─────────────────────────────────────── */

describe('canonical layout — interaction', () => {
  const column = orientedRun(
    2,
    { x: 100, y: 20 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { baselineAngle: Math.PI / 2, w: 8, h: 12 },
  );
  const layout = createTextLayout(
    snapshot(uprightRun(0, [uprightGlyph(10), uprightGlyph(18, { space: true })]), column),
  );

  test('charAt hits upright and rotated glyphs in their own frames', () => {
    expect(layout.charAt({ x: 14, y: 105 })).toBe(0);
    // middle column glyph: baseline span y 28..36, cell x 88..100
    expect(layout.charAt({ x: 94, y: 32 })).toBe(3);
    expect(layout.charAt({ x: 300, y: 300 })).toBeNull();
  });

  test('word expansion stops at spaces and empty characters', () => {
    expect(layout.wordAt(0)).toEqual({ start: 0, count: 1 }); // space at 1 ends the word
    expect(layout.wordAt(3)).toEqual({ start: 2, count: 3 });
  });

  test('line expansion stays within the anchor frame', () => {
    expect(layout.lineAt(3)).toEqual({ start: 2, count: 3 });
  });

  test('charQuad returns the oriented cell for endpoints', () => {
    const q = layout.charQuad(2);
    expect(q).not.toBeNull();
    expect(q!.p1.x).toBeCloseTo(88, 6);
    expect(q!.p1.y).toBeCloseTo(20, 6);
    expect(q!.p4.x).toBeCloseTo(100, 6);
    expect(q!.p4.y).toBeCloseTo(28, 6);
    expect(layout.charQuad(1)).not.toBeNull(); // spaces still have cells
  });

  test('a point works where a character number does', () => {
    expect(layout.wordAt({ x: 94, y: 32 })).toEqual(layout.wordAt(3));
    expect(layout.lineAt({ x: 94, y: 32 })).toEqual(layout.lineAt(3));
    expect(layout.wordAt({ x: 300, y: 300 })).toBeNull();
  });

  test('charCount counts every character; a number outside it finds nothing', () => {
    expect(layout.charCount).toBe(5);
    expect(layout.wordAt(5)).toBeNull();
    expect(layout.lineAt(-1)).toBeNull();
    expect(layout.charQuad(9)).toBeNull();
  });

  test('runs are the raw geometry it was built from', () => {
    const geometry = snapshot(uprightRun(0, [uprightGlyph(10)]));
    expect(createTextLayout(geometry).runs).toBe(geometry.runs);
  });
});

/* ── segmentation (search and selection share it) ────────────────────────── */

describe('canonical layout — segments', () => {
  const rectsOf = (geometry: PageGeometrySnapshot, start: number, count: number): PdfRect[] =>
    createTextLayout(geometry)
      .segments({ start, count })
      .map((segment) => segment.rect);
  /** Five 10pt-wide glyphs on one line starting at x. */
  const line = (start: number, x: number, bottom = 100, fontSize?: number) =>
    uprightRun(
      start,
      [0, 1, 2, 3, 4].map((i) => uprightGlyph(x + i * 10, { bottom })),
      fontSize,
    );

  test('a within-run range yields one line rect covering exactly those glyphs', () => {
    expect(rectsOf(snapshot(line(0, 0)), 1, 3)).toEqual([
      { left: 10, bottom: 100, right: 40, top: 110 },
    ]);
  });

  test('adjacent runs on the same line merge into one rect', () => {
    // Two text objects, visually one line — per-glyph or per-run boxes would
    // draw a fragmented highlight; the merge must produce a single rect.
    expect(rectsOf(snapshot(line(0, 0), line(5, 50)), 2, 6)).toEqual([
      { left: 20, bottom: 100, right: 80, top: 110 },
    ]);
  });

  test('a range across a line break yields one rect per line', () => {
    expect(rectsOf(snapshot(line(0, 0), line(5, 0, 80)), 3, 4)).toEqual([
      { left: 30, bottom: 100, right: 50, top: 110 },
      { left: 0, bottom: 80, right: 20, top: 90 },
    ]);
  });

  test('a big intra-run gap splits (columns share a text object)', () => {
    const columns = uprightRun(0, [
      uprightGlyph(0),
      uprightGlyph(10),
      uprightGlyph(300),
      uprightGlyph(310),
    ]);
    expect(rectsOf(snapshot(columns), 0, 4)).toEqual([
      { left: 0, bottom: 100, right: 20, top: 110 },
      { left: 300, bottom: 100, right: 320, top: 110 },
    ]);
  });

  test('wildly different font sizes on one line do not merge', () => {
    expect(rectsOf(snapshot(line(0, 0, 100, 8), line(5, 50, 100, 30)), 0, 10)).toHaveLength(2);
  });

  test('empty characters contribute nothing', () => {
    const empties = uprightRun(0, [
      uprightGlyph(0, { empty: true }),
      uprightGlyph(10, { empty: true }),
    ]);
    expect(rectsOf(snapshot(empties), 0, 2)).toEqual([]);
  });

  test('ranges outside the page and zero-length ranges are empty', () => {
    expect(rectsOf(snapshot(line(0, 0)), 50, 3)).toEqual([]);
    expect(rectsOf(snapshot(line(0, 0)), 0, 0)).toEqual([]);
  });

  test('runs are clipped to the requested range', () => {
    // Range starts mid-run-A and ends mid-run-B on another line.
    expect(rectsOf(snapshot(line(0, 0), line(5, 0, 80)), 4, 3)).toEqual([
      { left: 40, bottom: 100, right: 50, top: 110 },
      { left: 0, bottom: 80, right: 20, top: 90 },
    ]);
  });
});
