import { describe, expect, test } from 'vitest';
import type { PdfQuad, PdfRect } from '@embedpdf/engine-core/runtime';
import { createPdfTextLayout, isRotatedGeometryRun } from '@embedpdf/engine-core/runtime';
import {
  appendGlyphRecords,
  buildRunsFromRawGlyphs,
  EPDF_CHAR_GEOMETRY_LAYOUT,
  EPDF_PAGE_CHAR_GEOMETRY_LAYOUT,
  type RawGeometryGlyphRecord,
} from '@embedpdf/engine-services';

const box = (left: number, bottom: number, right: number, top: number): PdfRect => ({
  left,
  bottom,
  right,
  top,
});

/** Axis-aligned quad over a box. */
const quadOf = (left: number, bottom: number, right: number, top: number): PdfQuad => ({
  upperLeft: { x: left, y: top },
  upperRight: { x: right, y: top },
  lowerLeft: { x: left, y: bottom },
  lowerRight: { x: right, y: bottom },
});

/** Quad of the b×h cell at `origin`, rotated 90° CCW (baseline along +y). */
const rotatedQuad = (x: number, y: number, w: number, h: number): PdfQuad => ({
  upperLeft: { x: x + h, y: y },
  upperRight: { x: x + h, y: y + w },
  lowerLeft: { x: x, y: y },
  lowerRight: { x: x, y: y + w },
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
  baselineAngle: 0,
  ascentFlip: false,
  ...over,
});

const rotated = (
  objectKey: number,
  looseQuad: PdfQuad,
  baselineAngle: number,
  over: Partial<RawGeometryGlyphRecord> = {},
): RawGeometryGlyphRecord => ({
  objectKey,
  flags: 0,
  looseBox: box(0, 0, 0, 0),
  looseQuad,
  upright: false,
  baselineAngle,
  ascentFlip: false,
  ...over,
});

const empty = (objectKey: number): RawGeometryGlyphRecord => ({
  objectKey,
  flags: 2,
  looseBox: box(0, 0, 0, 0),
  upright: true,
  baselineAngle: 0,
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
    expect(first.start).toBe(0);
    expect(first.fontSize).toBe(12);
    expect(first.rect).toEqual(box(10, 10, 30, 22));
    // Boxes, not quads, and the space state only where it is true.
    expect(first.glyphs).toEqual([
      { loose: box(10, 10, 20, 22), tight: box(11, 12, 19, 20) },
      { loose: box(20, 10, 30, 22), space: true },
    ]);
    expect(second.start).toBe(2);
    expect(second.fontSize).toBe(9);
  });

  test("a run's rect covers its real glyphs; a glyph with no box takes no part", () => {
    const runs = buildRunsFromRawGlyphs([
      empty(1), // a generated space opening the object
      upright(1, box(100, 200, 110, 212)),
      empty(1),
      upright(1, box(110, 200, 120, 212)),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].rect).toEqual(box(100, 200, 120, 212));
    expect(runs[0].glyphs[0]).toEqual({ loose: box(0, 0, 0, 0), empty: true });
  });

  test('a triple-click on a line opening with a glyph with no box stays on that line', () => {
    const runs = buildRunsFromRawGlyphs([
      empty(1),
      upright(1, box(100, 600, 110, 612)),
      upright(1, box(110, 600, 120, 612)),
      upright(2, box(100, 500, 110, 512)), // the line below
    ]);
    expect(createPdfTextLayout({ runs }).lineAt(1)).toEqual({ start: 0, count: 3 });
  });

  test('a run of nothing but glyphs with no box keeps the zeroed rect', () => {
    const runs = buildRunsFromRawGlyphs([empty(1), empty(1)]);
    expect(runs).toHaveLength(1);
    expect(runs[0].rect).toEqual(box(0, 0, 0, 0));
  });

  test('a rotated run opening with a glyph with no box covers only its real cells', () => {
    const q1 = rotatedQuad(50, 100, 10, 14);
    const runs = buildRunsFromRawGlyphs([empty(1), rotated(1, q1, Math.PI / 2)]);
    expect(runs).toHaveLength(1);
    expect(isRotatedGeometryRun(runs[0])).toBe(true);
    expect(runs[0].rect).toEqual(box(50, 100, 64, 110));
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
    expect(run.rotation).toBeCloseTo(270, 6);
    expect(run.ascentFlip).toBe(false);
    expect(run.fontSize).toBe(10);
    expect(run.glyphs[0].loose).toEqual(q1);
    expect(run.glyphs[0].tight).toEqual(rotatedQuad(51, 101, 8, 12));
    expect(run.glyphs[1]).toEqual({
      loose: {
        upperLeft: { x: 0, y: 0 },
        upperRight: { x: 0, y: 0 },
        lowerLeft: { x: 0, y: 0 },
        lowerRight: { x: 0, y: 0 },
      },
      empty: true,
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
    expect(runs[0].start).toBe(0);
    expect(runs[1].start).toBe(2);
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
      upright(1, box(10, 10, 30, 22), { upright: false, baselineAngle: Math.PI / 2 }),
    ]);
    expect(runs).toHaveLength(1);
    const run = runs[0];
    expect(isRotatedGeometryRun(run)).toBe(false);
    if (isRotatedGeometryRun(run)) return; // narrows: only upright glyphs carry a box
    expect(run.glyphs[0].loose).toEqual(box(10, 10, 30, 22));
  });
});

/** One `EPDF_PAGE_CHAR_GEOMETRY` as the native call writes it. */
interface NativeGlyph {
  objectRun: number;
  fontSize: number;
  flags: number;
  /** `FS_RECTF` order: left, top, right, bottom. */
  looseBox?: [number, number, number, number];
  tightBox?: [number, number, number, number];
  /** `FS_QUADPOINTSF` order: upper start, upper end, lower start, lower end. */
  looseQuad?: number[];
  tightQuad?: number[];
  /** `FS_MATRIX` order: a, b, c, d, e, f. */
  matrix?: number[];
}

const BITS = EPDF_CHAR_GEOMETRY_LAYOUT.flags;

function nativeBytes(glyphs: NativeGlyph[]): Uint8Array {
  const { bytes, offsets: record } = EPDF_PAGE_CHAR_GEOMETRY_LAYOUT;
  const { offsets } = EPDF_CHAR_GEOMETRY_LAYOUT;
  const out = new Uint8Array(glyphs.length * bytes);
  const view = new DataView(out.buffer);
  const floats = (at: number, values: number[] = []) =>
    values.forEach((value, i) => view.setFloat32(at + i * 4, value, true));
  glyphs.forEach((glyph, i) => {
    const at = i * bytes + record.geometry;
    floats(at + offsets.looseBox, glyph.looseBox);
    floats(at + offsets.tightBox, glyph.tightBox);
    floats(at + offsets.looseQuad, glyph.looseQuad);
    floats(at + offsets.tightQuad, glyph.tightQuad);
    floats(at + offsets.matrix, glyph.matrix);
    view.setUint32(at + offsets.flags, glyph.flags, true);
    view.setUint32(i * bytes + record.objectRun, glyph.objectRun, true);
    view.setFloat32(i * bytes + record.fontSize, glyph.fontSize, true);
  });
  return out;
}

describe('appendGlyphRecords', () => {
  test('an upright glyph reads its boxes, and leaves the cells the native layer offers', () => {
    const records: RawGeometryGlyphRecord[] = [];
    appendGlyphRecords(
      records,
      nativeBytes([
        {
          objectRun: 0,
          fontSize: 12,
          flags: BITS.upright | BITS.hasTightBox | BITS.hasLooseQuad | BITS.hasTightQuad,
          looseBox: [10, 22, 20, 10],
          tightBox: [11, 20, 19, 12],
          looseQuad: [10, 22, 20, 22, 10, 10, 20, 10],
          tightQuad: [11, 20, 19, 20, 11, 12, 19, 12],
          matrix: [1, 0, 0, 1, 10, 10],
        },
      ]),
    );
    expect(records).toEqual([
      {
        objectKey: 0,
        fontSize: 12,
        flags: 0,
        looseBox: box(10, 10, 20, 22),
        tightBox: box(11, 12, 19, 20),
        upright: true,
        baselineAngle: 0,
        ascentFlip: false,
      },
    ]);
  });

  test('a box written with its edges swapped is read in order', () => {
    const records: RawGeometryGlyphRecord[] = [];
    appendGlyphRecords(
      records,
      nativeBytes([
        { objectRun: 0, fontSize: 12, flags: BITS.upright, looseBox: [20, 10, 10, 22] },
      ]),
    );
    expect(records[0].looseBox).toEqual(box(10, 10, 20, 22));
  });

  test('a turned glyph reads its cells, its baseline angle and its ascent side', () => {
    const cell = rotatedQuad(50, 100, 10, 14);
    const records: RawGeometryGlyphRecord[] = [];
    appendGlyphRecords(
      records,
      nativeBytes([
        {
          objectRun: 0,
          fontSize: 10,
          flags: BITS.hasLooseQuad,
          looseBox: [50, 110, 64, 100],
          // A quarter turn counter-clockwise: the baseline runs up the page.
          looseQuad: [64, 100, 64, 110, 50, 100, 50, 110],
          matrix: [0, 1, -1, 0, 64, 100],
        },
        {
          objectRun: 0,
          fontSize: 10,
          flags: BITS.hasLooseQuad,
          looseBox: [50, 110, 64, 100],
          looseQuad: [64, 100, 64, 110, 50, 100, 50, 110],
          // The same turn, mirrored: the ascent points the other way.
          matrix: [0, 1, 1, 0, 50, 100],
        },
      ]),
    );
    expect(records[0].upright).toBe(false);
    expect(records[0].looseQuad).toEqual(cell);
    expect(records[0].tightQuad).toBeUndefined();
    expect(records[0].baselineAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(records[0].ascentFlip).toBe(false);
    expect(records[1].ascentFlip).toBe(true);
  });

  test('a glyph with no box is the zeroed glyph, and a space says so', () => {
    const records: RawGeometryGlyphRecord[] = [];
    appendGlyphRecords(
      records,
      nativeBytes([
        { objectRun: 0, fontSize: 1, flags: BITS.empty | BITS.space, looseBox: [5, 5, 5, 5] },
        { objectRun: 0, fontSize: 1, flags: BITS.upright | BITS.space, looseBox: [0, 12, 4, 0] },
      ]),
    );
    expect(records[0]).toEqual({
      objectKey: 0,
      fontSize: 1,
      flags: 2,
      looseBox: box(0, 0, 0, 0),
      upright: true,
      baselineAngle: 0,
      ascentFlip: false,
    });
    expect(records[1].flags).toBe(1);
  });

  test('a glyph gets a font size where its text object changes, across two reads too', () => {
    const glyph = (objectRun: number, fontSize: number): NativeGlyph => ({
      objectRun,
      fontSize,
      flags: BITS.upright,
      looseBox: [0, 12, 10, 0],
    });
    const records: RawGeometryGlyphRecord[] = [];
    appendGlyphRecords(records, nativeBytes([glyph(0, 12), glyph(0, 12), glyph(1, 9)]));
    // The page's next glyphs: the first continues the run the last read ended in.
    appendGlyphRecords(records, nativeBytes([glyph(1, 9), glyph(2, 16)]));

    expect(records.map((record) => record.objectKey)).toEqual([0, 0, 1, 1, 2]);
    expect(records.map((record) => record.fontSize)).toEqual([12, undefined, 9, undefined, 16]);
    expect(buildRunsFromRawGlyphs(records).map((run) => [run.start, run.fontSize])).toEqual([
      [0, 12],
      [2, 9],
      [4, 16],
    ]);
  });
});

describe('EPDF_PAGE_CHAR_GEOMETRY ABI layout', () => {
  test('mirrors the native static_asserts (fpdfsdk/fpdf_text.cpp)', () => {
    expect(EPDF_PAGE_CHAR_GEOMETRY_LAYOUT).toEqual({
      bytes: 132,
      offsets: {
        geometry: 0,
        objectRun: 124,
        fontSize: 128,
      },
    });
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
