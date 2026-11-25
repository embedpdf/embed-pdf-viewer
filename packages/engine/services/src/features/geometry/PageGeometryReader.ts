import type {
  PageGeometryGlyph,
  PageGeometryRun,
  PageGeometrySnapshot,
  PageObjectNumber,
  PdfCoordinates,
  PdfQuad,
  PdfRect,
  RotatedGeometryGlyph,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  normalizePdfRect,
  pdfQuadBounds,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import {
  EPDF_CHAR_GEOMETRY_LAYOUT,
  EPDF_PAGE_CHAR_GEOMETRY_LAYOUT,
} from '../../runtime/memory/structs';
import { throwIfAborted } from '../../shared/abort';
import { SliceTimer, type Slices } from '../../shared/slices';

/**
 * Mid-object orientation drift that forces a run split (~0.5°). Real content
 * keeps one char matrix per text object; this guards the exotic cases so a
 * run's `baselineAngle` is always representative of every glyph in it.
 */
const ROTATION_SPLIT_TOLERANCE = 0.0087;

/** A record's flags; the wire carries them as `space` and `empty`. */
const FLAG_SPACE = 1;
const FLAG_EMPTY = 2;

/**
 * How many glyphs one `EPDFText_GetPageGeometry` call reads. Most pages take
 * one call; a page with more glyphs is read in several, so the buffer stays
 * small and an abort stops the read between two of them.
 */
const GLYPHS_PER_CALL = 4096;

/**
 * One glyph as read from `EPDFText_GetPageGeometry`, plus the run-grouping
 * context sampled alongside it. Pure data — no native handles — so the
 * grouping stage below is a pure function the tests can drive directly.
 */
export interface RawGeometryGlyphRecord {
  /**
   * Grouping key: consecutive glyphs of one text object share it, and it
   * changes where the text object does.
   */
  objectKey: number | bigint;
  /** Sampled at each text object's first glyph (run splits inherit it). */
  fontSize?: number;
  /**
   * `FLAG_SPACE` and `FLAG_EMPTY`. Synthesized-but-visible glyphs
   * (/ActualText pieces) stay 0, exactly like the legacy reader — they
   * represent real, selectable text.
   */
  flags: number;
  /** Page-space AABB (zeroed when empty). */
  looseBox: PdfRect;
  tightBox?: PdfRect;
  /**
   * Oriented cells — real glyphs that aren't upright and have a usable
   * (non-singular) matrix only. An upright glyph's cells are its boxes.
   */
  looseQuad?: PdfQuad;
  tightQuad?: PdfQuad;
  /** Native uprightness of the char matrix (empty glyphs: true, inert). */
  upright: boolean;
  /** Baseline angle (radians CCW, PDF y-up); 0 when upright. */
  baselineAngle: number;
  /** True when the ascent vector maps opposite the rotated +y (det < 0). */
  ascentFlip: boolean;
}

/** The orientation class a run commits to at its first classifiable glyph. */
type RunClass = { upright: true } | { upright: false; baselineAngle: number; ascentFlip: boolean };

/**
 * Geometry-only text layout reader.
 *
 * Emits geometry in PDF user space (y-up edges) — the canonical engine
 * geometry. The viewer converts to content/view space via the page geometry
 * matrix; this reader applies no Y-flip or device transform.
 *
 * One `EPDFText_GetPageGeometry` call supplies the boxes, oriented cells and
 * flags of up to {@link GLYPHS_PER_CALL} glyphs; `buildRunsFromRawGlyphs` then
 * groups glyphs into the upright/rotated run union. Upright runs are
 * byte-identical to the pre-orientation reader (quads the native layer offers
 * are deliberately dropped — the dominant case never pays for orientation).
 */
export class PageGeometryReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * A page's text geometry. The page loads in slices when it isn't parsed, and
   * the read pauses between two calls once a slice's budget is spent, so an
   * abort stops it at either.
   */
  async read(
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<PageGeometrySnapshot<PdfCoordinates>> {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = await pool.acquireInSlices(pageObjectNumber, signal, slices);

    try {
      throwIfAborted(signal);
      const textPagePtr = fn.FPDFText_LoadPage(pagePtr);
      if (!textPagePtr) {
        throw new EngineError(
          EngineErrorCode.RuntimeUnavailable,
          `FPDFText_LoadPage returned null for page object ${pageObjectNumber}`,
        );
      }
      try {
        throwIfAborted(signal);
        const glyphCount = Math.max(fn.FPDFText_CountChars(textPagePtr), 0);
        if (glyphCount === 0) return { runs: [] };

        const records: RawGeometryGlyphRecord[] = [];
        const capacity = Math.min(glyphCount, GLYPHS_PER_CALL);
        const bufferPtr = mem.alloc(capacity * EPDF_PAGE_CHAR_GEOMETRY_LAYOUT.bytes);
        try {
          const timer = new SliceTimer(slices, signal);
          for (let start = 0; start < glyphCount; start += capacity) {
            if (timer.due) await timer.pause();
            const expected = Math.min(capacity, glyphCount - start);
            const written = fn.EPDFText_GetPageGeometry(textPagePtr, start, capacity, bufferPtr);
            if (written !== expected) {
              throw new EngineError(
                EngineErrorCode.RuntimeUnavailable,
                `EPDFText_GetPageGeometry read ${written} of ${expected} glyphs from ${start} for page object ${pageObjectNumber}`,
              );
            }
            appendGlyphRecords(
              records,
              mem.readBytes(bufferPtr, written * EPDF_PAGE_CHAR_GEOMETRY_LAYOUT.bytes),
            );
          }
        } finally {
          mem.free(bufferPtr);
        }

        return { runs: buildRunsFromRawGlyphs(records) };
      } finally {
        fn.FPDFText_ClosePage(textPagePtr);
      }
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}

/**
 * Decode `EPDF_PAGE_CHAR_GEOMETRY` records, as `EPDFText_GetPageGeometry`
 * writes them, onto the end of `records`. Pure — exported for tests.
 *
 * `bytes` continues the page where `records` stops: a glyph gets a `fontSize`
 * where its text object differs from the glyph before it, across the two.
 */
export function appendGlyphRecords(records: RawGeometryGlyphRecord[], bytes: Uint8Array): void {
  const { bytes: recordBytes, offsets: record } = EPDF_PAGE_CHAR_GEOMETRY_LAYOUT;
  const { offsets, flags: bits } = EPDF_CHAR_GEOMETRY_LAYOUT;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const f32 = (at: number) => view.getFloat32(at, true);
  const rectAt = (at: number): PdfRect =>
    normalizePdfRect({ left: f32(at), top: f32(at + 4), right: f32(at + 8), bottom: f32(at + 12) });
  const quadAt = (at: number): PdfQuad => ({
    upperLeft: { x: f32(at), y: f32(at + 4) },
    upperRight: { x: f32(at + 8), y: f32(at + 12) },
    lowerLeft: { x: f32(at + 16), y: f32(at + 20) },
    lowerRight: { x: f32(at + 24), y: f32(at + 28) },
  });

  let prevObjectKey = records.length > 0 ? records[records.length - 1].objectKey : null;
  for (let at = 0; at + recordBytes <= bytes.byteLength; at += recordBytes) {
    const geometry = at + record.geometry;
    const objectKey = view.getUint32(at + record.objectRun, true);
    const glyph: RawGeometryGlyphRecord = { objectKey, ...glyphAt(geometry) };
    if (objectKey !== prevObjectKey) {
      glyph.fontSize = f32(at + record.fontSize);
      prevObjectKey = objectKey;
    }
    records.push(glyph);
  }

  function glyphAt(geometry: number): Omit<RawGeometryGlyphRecord, 'objectKey' | 'fontSize'> {
    const native = view.getUint32(geometry + offsets.flags, true);
    // Degenerate geometry keeps the legacy zeroed-glyph convention so
    // upright snapshots stay bit-identical to the pre-orientation reader.
    if (native & bits.empty) {
      return emptyRawGlyph();
    }

    const upright = Boolean(native & bits.upright);
    const raw: Omit<RawGeometryGlyphRecord, 'objectKey' | 'fontSize'> = {
      flags: native & bits.space ? FLAG_SPACE : 0,
      looseBox: rectAt(geometry + offsets.looseBox),
      upright,
      baselineAngle: 0,
      ascentFlip: false,
    };
    if (native & bits.hasTightBox) {
      raw.tightBox = rectAt(geometry + offsets.tightBox);
    }
    // An upright glyph's run carries its boxes, so its cells go unread.
    if (native & bits.hasLooseQuad && !upright) {
      raw.looseQuad = quadAt(geometry + offsets.looseQuad);
      if (native & bits.hasTightQuad) {
        raw.tightQuad = quadAt(geometry + offsets.tightQuad);
      }
      const a = f32(geometry + offsets.matrix);
      const b = f32(geometry + offsets.matrix + 4);
      const c = f32(geometry + offsets.matrix + 8);
      const d = f32(geometry + offsets.matrix + 12);
      raw.baselineAngle = Math.atan2(b, a);
      raw.ascentFlip = a * d - b * c < 0;
    }
    return raw;
  }
}

/**
 * Group per-glyph records into the run union. Pure — exported for tests.
 *
 * Runs split on text-object change (the legacy rule) and on orientation
 * change between classifiable glyphs (θ drift / mixed orientation). A run's
 * variant is decided by its first classifiable glyph:
 *   - empty glyphs never classify (they adopt the run's variant);
 *   - real glyphs without an oriented cell (singular matrix, synthesized
 *     /ActualText pieces) classify as upright — box-only data degrades to
 *     exactly the legacy behavior;
 *   - real glyphs with a non-upright matrix classify as rotated.
 * Runs that never see a classifiable glyph emit as upright (degenerate,
 * legacy behavior).
 */
export function buildRunsFromRawGlyphs(
  records: RawGeometryGlyphRecord[],
): PageGeometryRun<PdfCoordinates>[] {
  const runs: PageGeometryRun<PdfCoordinates>[] = [];
  let buffer: RawGeometryGlyphRecord[] = [];
  let charStart = 0;
  let fontSize: number | undefined;
  let objectKey: number | bigint | null = null;
  let cls: RunClass | undefined;

  const flush = (nextStart: number) => {
    if (buffer.length > 0) {
      runs.push(materializeRun(buffer, charStart, fontSize, cls));
      buffer = [];
      cls = undefined;
    }
    charStart = nextStart;
  };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.objectKey !== objectKey) {
      flush(i);
      objectKey = record.objectKey;
      fontSize = record.fontSize;
    }
    const recordClass = classOf(record);
    if (recordClass) {
      if (cls && !sameClass(cls, recordClass)) flush(i);
      if (!cls) cls = recordClass;
    }
    buffer.push(record);
  }
  flush(records.length);
  return runs;
}

function classOf(record: RawGeometryGlyphRecord): RunClass | undefined {
  if (record.flags & FLAG_EMPTY) return undefined; // empty glyphs never classify
  if (record.looseQuad && !record.upright) {
    return { upright: false, baselineAngle: record.baselineAngle, ascentFlip: record.ascentFlip };
  }
  return { upright: true };
}

/** A baseline's angle (radians, counter-clockwise) as the API's turn: degrees clockwise, 0 up to 360. */
function rotationOfBaseline(radians: number): number {
  const degrees = (-radians * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

function sameClass(a: RunClass, b: RunClass): boolean {
  if (a.upright || b.upright) return a.upright === b.upright;
  if (a.ascentFlip !== b.ascentFlip) return false;
  const delta = a.baselineAngle - b.baselineAngle;
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= ROTATION_SPLIT_TOLERANCE;
}

function materializeRun(
  buffer: RawGeometryGlyphRecord[],
  charStart: number,
  fontSize: number | undefined,
  cls: RunClass | undefined,
): PageGeometryRun<PdfCoordinates> {
  if (cls && !cls.upright) {
    const glyphs: RotatedGeometryGlyph<PdfCoordinates>[] = buffer.map((g) =>
      g.looseQuad
        ? {
            loose: g.looseQuad,
            ...(g.tightQuad ? { tight: g.tightQuad } : {}),
            ...statesOf(g.flags),
          }
        : // Empty glyphs inside a rotated run: zeroed quad + empty,
          // mirroring the upright variant's zeroed-box convention.
          { loose: zeroQuad(), ...statesOf(g.flags) },
    );
    return {
      rect: runBounds(buffer, (g) => (g.looseQuad ? pdfQuadBounds(g.looseQuad) : ZERO_RECT)),
      start: charStart,
      glyphs,
      rotation: rotationOfBaseline(cls.baselineAngle),
      ascentFlip: cls.ascentFlip,
      ...(fontSize !== undefined ? { fontSize } : {}),
    };
  }

  // Upright (and degenerate-only) runs: native-offered quads are dropped, and
  // the rect is the union of the real glyphs' boxes.
  const glyphs: PageGeometryGlyph<PdfCoordinates>[] = buffer.map((g) => ({
    loose: g.looseBox,
    ...(g.tightBox ? { tight: g.tightBox } : {}),
    ...statesOf(g.flags),
  }));
  return {
    rect: runBounds(buffer, (g) => g.looseBox),
    start: charStart,
    glyphs,
    ...(fontSize !== undefined ? { fontSize } : {}),
  };
}

/** A glyph's space and empty states, present only when true. */
function statesOf(flags: number): { space?: true; empty?: true } {
  return {
    ...(flags & FLAG_SPACE ? { space: true } : {}),
    ...(flags & FLAG_EMPTY ? { empty: true } : {}),
  };
}

/**
 * A run's box: the union of its glyphs' boxes. A glyph with no box
 * (`FLAG_EMPTY`) has only a zeroed stand-in, so it takes no part; a run of
 * nothing but such glyphs gets the zeroed box itself.
 */
function runBounds(
  buffer: RawGeometryGlyphRecord[],
  boundsOf: (g: RawGeometryGlyphRecord) => PdfRect,
): PdfRect {
  let rect: PdfRect | null = null;
  for (const g of buffer) {
    if (g.flags & FLAG_EMPTY) continue;
    const b = boundsOf(g);
    if (!rect) {
      rect = { left: b.left, bottom: b.bottom, right: b.right, top: b.top };
      continue;
    }
    rect.left = Math.min(rect.left, b.left);
    rect.bottom = Math.min(rect.bottom, b.bottom);
    rect.right = Math.max(rect.right, b.right);
    rect.top = Math.max(rect.top, b.top);
  }
  return rect ?? { ...ZERO_RECT };
}

const ZERO_RECT: PdfRect = { left: 0, bottom: 0, right: 0, top: 0 };

function zeroQuad(): PdfQuad {
  return {
    upperLeft: { x: 0, y: 0 },
    upperRight: { x: 0, y: 0 },
    lowerLeft: { x: 0, y: 0 },
    lowerRight: { x: 0, y: 0 },
  };
}

function emptyRawGlyph(): Omit<RawGeometryGlyphRecord, 'objectKey' | 'fontSize'> {
  return {
    flags: FLAG_EMPTY,
    looseBox: { left: 0, bottom: 0, right: 0, top: 0 },
    upright: true,
    baselineAngle: 0,
    ascentFlip: false,
  };
}
