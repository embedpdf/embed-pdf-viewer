import { describe, expect, test } from 'vitest';
import { searchRectsForRange } from '../../src/shared';
import type { PageGeometryRun, PageGeometrySnapshot } from '../../src/shared';

interface GlyphSpec {
  x: number;
  w?: number;
  bottom?: number;
  top?: number;
  flags?: number;
}

function run(charStart: number, glyphs: GlyphSpec[], fontSize?: number): PageGeometryRun {
  const gs = glyphs.map((g) => ({
    looseBox: {
      left: g.x,
      right: g.x + (g.w ?? 10),
      bottom: g.bottom ?? 100,
      top: g.top ?? 110,
    },
    flags: g.flags ?? 0,
  }));
  const rect = gs.reduce(
    (acc, g) => ({
      left: Math.min(acc.left, g.looseBox.left),
      right: Math.max(acc.right, g.looseBox.right),
      bottom: Math.min(acc.bottom, g.looseBox.bottom),
      top: Math.max(acc.top, g.looseBox.top),
    }),
    { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity },
  );
  return { rect, charStart, glyphs: gs, fontSize };
}

const snapshot = (...runs: PageGeometryRun[]): PageGeometrySnapshot => ({ runs });

/** Five 10pt-wide glyphs on one line starting at x. */
const line = (charStart: number, x: number, bottom = 100, fontSize?: number) =>
  run(
    charStart,
    Array.from({ length: 5 }, (_, i) => ({ x: x + i * 10, bottom, top: bottom + 10 })),
    fontSize,
  );

describe('searchRectsForRange', () => {
  test('a within-run range yields one line rect covering exactly those glyphs', () => {
    const rects = searchRectsForRange(snapshot(line(0, 0)), 1, 3);
    expect(rects).toEqual([{ left: 10, bottom: 100, right: 40, top: 110 }]);
  });

  test('adjacent runs on the same line merge into ONE rect (the v2 fix)', () => {
    // Two text objects, visually one line — per-glyph or per-run boxes are
    // exactly the v2 highlight bug; the merge must produce a single rect.
    const rects = searchRectsForRange(snapshot(line(0, 0), line(5, 50)), 2, 6);
    expect(rects).toEqual([{ left: 20, bottom: 100, right: 80, top: 110 }]);
  });

  test('a range across a line break yields one rect per line', () => {
    const rects = searchRectsForRange(snapshot(line(0, 0), line(5, 0, 80)), 3, 4);
    expect(rects).toEqual([
      { left: 30, bottom: 100, right: 50, top: 110 },
      { left: 0, bottom: 80, right: 20, top: 90 },
    ]);
  });

  test('a big intra-run gap splits (columns share a text object)', () => {
    const rects = searchRectsForRange(
      snapshot(
        run(0, [{ x: 0 }, { x: 10 }, { x: 300 }, { x: 310 }]), // 2 glyphs, huge gap, 2 glyphs
      ),
      0,
      4,
    );
    expect(rects).toEqual([
      { left: 0, bottom: 100, right: 20, top: 110 },
      { left: 300, bottom: 100, right: 320, top: 110 },
    ]);
  });

  test('wildly different font sizes on one line do not merge', () => {
    const rects = searchRectsForRange(snapshot(line(0, 0, 100, 8), line(5, 50, 100, 30)), 0, 10);
    expect(rects).toHaveLength(2);
  });

  test('empty-flagged glyphs contribute nothing', () => {
    const rects = searchRectsForRange(
      snapshot(
        run(0, [
          { x: 0, flags: 2 },
          { x: 10, flags: 2 },
        ]),
      ),
      0,
      2,
    );
    expect(rects).toEqual([]);
  });

  test('ranges outside the snapshot and zero-length ranges are empty', () => {
    expect(searchRectsForRange(snapshot(line(0, 0)), 50, 3)).toEqual([]);
    expect(searchRectsForRange(snapshot(line(0, 0)), 0, 0)).toEqual([]);
  });

  test('runs are clipped to the requested range', () => {
    // Range starts mid-run-A and ends mid-run-B on another line.
    const rects = searchRectsForRange(snapshot(line(0, 0), line(5, 0, 80)), 4, 3);
    expect(rects).toEqual([
      { left: 40, bottom: 100, right: 50, top: 110 },
      { left: 0, bottom: 80, right: 20, top: 90 },
    ]);
  });
});
