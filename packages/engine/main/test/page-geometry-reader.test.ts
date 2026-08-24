import { describe, expect, test } from 'vitest';
import type { PdfQuad, PdfRect } from '@embedpdf/engine-core/runtime';
import { isRotatedGeometryRun } from '@embedpdf/engine-core/runtime';
import {
  buildRunsFromRawGlyphs,
  EPDF_CHAR_GEOMETRY_LAYOUT,
  type RawGeometryGlyphRecord,
} from '@embedpdf/engine-services';

const box = (left: number, bottom: number, right: number, top: number): PdfRect => ({
  left,
  bottom,
  right,
  top,
});

/** Axis-aligned quad in the frame-geometric slot order (US, UE, LS, LE). */
const quadOf = (left: number, bottom: number, right: number, top: number): PdfQuad => ({
  p1: { x: left, y: top },
  p2: { x: right, y: top },
  p3: { x: left, y: bottom },
  p4: { x: right, y: bottom },
});

/** Quad of the b×h cell at `origin`, rotated 90° CCW (baseline along +y). */
const rotatedQuad = (x: number, y: number, w: number, h: number): PdfQuad => ({
  p1: { x: x + h, y: y }, // upper-start
  p2: { x: x + h, y: y + w }, // upper-end
  p3: { x: x, y: y }, // lower-start
  p4: { x: x, y: y + w }, // lower-end
});

const upright = (
  objectKey: number,
  looseBox: PdfRect,
  over: Partial<RawGeometryGlyphRecord> = {},
): RawGeometryGlyphRecord => ({
  objectKey,
  flags: 0,
  looseBox,
  upright: true,
  rotation: 0,
  ascentFlip: false,
  ...over,
});

const rotated = (
  objectKey: number,
  looseQuad: PdfQuad,
  rotation: number,
  over: Partial<RawGeometryGlyphRecord> = {},
): RawGeometryGlyphRecord => ({
  objectKey,
  flags: 0,
  looseBox: box(0, 0, 0, 0),
  looseQuad,
  upright: false,
  rotation,
  ascentFlip: false,
  ...over,
});

const empty = (objectKey: number): RawGeometryGlyphRecord => ({
  objectKey,
  flags: 2,
  looseBox: box(0, 0, 0, 0),
  upright: true,
  rotation: 0,
  ascentFlip: false,
});

describe('buildRunsFromRawGlyphs', () => {
  test('groups upright glyphs per text object and drops native-offered quads', () => {
    const runs = buildRunsFromRawGlyphs([
      upright(1, box(10, 10, 20, 22), {
        fontSize: 12,
        tightBox: box(11, 12, 19, 20),
        // The native layer offers quads for every real glyph — upright runs
        // must not carry them onto the wire.
        looseQuad: quadOf(10, 10, 20, 22),
        tightQuad: quadOf(11, 12, 19, 20),
      }),
      upright(1, box(20, 10, 30, 22), { flags: 1 }),
      upright(2, box(40, 10, 50, 22), { fontSize: 9 }),
    ]);

    expect(runs).toHaveLength(2);
    const [first, second] = runs;
    expect(isRotatedGeometryRun(first)).toBe(false);
    expect(first.charStart).toBe(0);
    expect(first.fontSize).toBe(12);
    expect(first.rect).toEqual(box(10, 10, 30, 22));
    expect(first.glyphs).toEqual([
      { looseBox: box(10, 10, 20, 22), flags: 0, tightBox: box(11, 12, 19, 20) },
      { looseBox: box(20, 10, 30, 22), flags: 1 },
    ]);
    expect(first.glyphs.some((g) => 'looseQuad' in g || 'tightQuad' in g)).toBe(false);
    expect(second.charStart).toBe(2);
    expect(second.fontSize).toBe(9);
  });

  test('legacy run rect seeds from the first glyph, zero-seed quirk included', () => {
    const runs = buildRunsFromRawGlyphs([
      empty(1), // a generated space opening the object: zeroed seed
      upright(1, box(100, 200, 110, 212)),
    ]);
    expect(runs).toHaveLength(1);
    // The seed participates in the union — exactly the legacy reader's
    // behavior for runs opening with a degenerate glyph.
    expect(runs[0].rect).toEqual(box(0, 0, 110, 212));
    expect(runs[0].glyphs[0]).toEqual({ looseBox: box(0, 0, 0, 0), flags: 2 });
  });

  test('rotated object emits the rotated variant; empty glyphs get zeroed quads', () => {
    const q1 = rotatedQuad(50, 100, 10, 14);
    const q2 = rotatedQuad(50, 112, 10, 14);
    const runs = buildRunsFromRawGlyphs([
      rotated(1, q1, Math.PI / 2, { fontSize: 10, tightQuad: rotatedQuad(51, 101, 8, 12) }),
      empty(1),
      rotated(1, q2, Math.PI / 2),
    ]);

    expect(runs).toHaveLength(1);
    const run = runs[0];
    if (!isRotatedGeometryRun(run)) throw new Error('expected a rotated run');
    expect(run.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(run.ascentFlip).toBe(false);
    expect(run.fontSize).toBe(10);
    expect(run.glyphs[0].looseQuad).toEqual(q1);
    expect(run.glyphs[0].tightQuad).toEqual(rotatedQuad(51, 101, 8, 12));
    expect(run.glyphs[1]).toEqual({
      looseQuad: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 }, p4: { x: 0, y: 0 } },
      flags: 2,
    });
    // Page-space AABB over the real glyphs' cells (the first glyph is real,
    // so the seed is its bounds — no zero-seed here).
    expect(run.rect).toEqual(box(50, 100, 64, 122));
  });

  test('orientation change mid-object splits the run and inherits fontSize', () => {
    const runs = buildRunsFromRawGlyphs([
      upright(1, box(10, 10, 20, 22), { fontSize: 12 }),
      upright(1, box(20, 10, 30, 22)),
      rotated(1, rotatedQuad(40, 10, 10, 12), Math.PI / 2),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0].charStart).toBe(0);
    expect(runs[1].charStart).toBe(2);
    expect(isRotatedGeometryRun(runs[0])).toBe(false);
    expect(isRotatedGeometryRun(runs[1])).toBe(true);
    expect(runs[1].fontSize).toBe(12); // same text object → inherited
  });

  test('θ drift splits beyond the tolerance and holds within it', () => {
    const base = Math.PI / 4;
    const within = buildRunsFromRawGlyphs([
      rotated(1, rotatedQuad(0, 0, 10, 12), base),
      rotated(1, rotatedQuad(0, 12, 10, 12), base + 0.005),
    ]);
    expect(within).toHaveLength(1);

    const beyond = buildRunsFromRawGlyphs([
      rotated(1, rotatedQuad(0, 0, 10, 12), base),
      rotated(1, rotatedQuad(0, 12, 10, 12), base + 0.02),
    ]);
    expect(beyond).toHaveLength(2);
  });

  test('ascentFlip mismatch splits the run', () => {
    const runs = buildRunsFromRawGlyphs([
      rotated(1, rotatedQuad(0, 0, 10, 12), Math.PI, { ascentFlip: true }),
      rotated(1, rotatedQuad(0, 12, 10, 12), Math.PI, { ascentFlip: false }),
    ]);
    expect(runs).toHaveLength(2);
  });

  test('quad-less non-upright glyphs degrade to an upright run', () => {
    // Synthesized /ActualText pieces and singular-matrix glyphs have boxes
    // but no oriented cells — they classify upright (legacy behavior).
    const runs = buildRunsFromRawGlyphs([
      upright(1, box(10, 10, 30, 22), { upright: false, rotation: Math.PI / 2 }),
    ]);
    expect(runs).toHaveLength(1);
    expect(isRotatedGeometryRun(runs[0])).toBe(false);
    expect(runs[0].glyphs[0].looseBox).toEqual(box(10, 10, 30, 22));
  });
});

describe('EPDF_CHAR_GEOMETRY ABI layout', () => {
  test('mirrors the native static_asserts (fpdfsdk/fpdf_text.cpp)', () => {
    // Change detector: these numbers are pinned on the C++ side by
    // static_asserts against the real struct. If either side moves, both
    // must move together.
    expect(EPDF_CHAR_GEOMETRY_LAYOUT).toEqual({
      bytes: 124,
      offsets: {
        looseBox: 0,
        tightBox: 16,
        looseQuad: 32,
        tightQuad: 64,
        matrix: 96,
        flags: 120,
      },
      flags: {
        hasTightBox: 1 << 0,
        hasLooseQuad: 1 << 1,
        hasTightQuad: 1 << 2,
        upright: 1 << 3,
        space: 1 << 4,
        empty: 1 << 5,
        synthesized: 1 << 6,
      },
    });
  });
});
