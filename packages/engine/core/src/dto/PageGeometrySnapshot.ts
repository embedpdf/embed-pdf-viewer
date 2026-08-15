import { pdfQuadBounds } from '../geometry/convert';
import type { PdfQuad, PdfRect } from '../geometry/primitives';

/**
 * One upright glyph's geometry in PDF user space (y-up edges).
 *
 * `looseBox` is the loose char cell (pdfium `FPDFText_GetLooseCharBox`): the
 * font-metric box covering the full glyph cell without regard to the actual
 * glyph shape. Always present (zeroed + flagged empty for degenerate glyphs);
 * it's the box selection envelopes are built from.
 *
 * `tightBox` is the tight char box (pdfium `FPDFText_GetCharBox`): the box
 * hugging the actual glyph shape. Optional — absent for empty/whitespace
 * glyphs that have no real outline.
 *
 * `flags` carries slim per-glyph state (bit 1 = space, bit 2 = empty).
 */
export interface PageGeometryGlyph {
  looseBox: PdfRect;
  flags: number;
  tightBox?: PdfRect;
}

/**
 * One non-upright glyph's geometry: the exact oriented cells, in PDF user
 * space (page coordinates — NOT a local frame). The corner SLOTS are
 * frame-geometric in the glyph's own upright frame:
 * `p1` = upper-start, `p2` = upper-end, `p3` = lower-start, `p4` = lower-end,
 * where "upper" is the ascent side and "start" is the frame's minimum-x side.
 * Deliberately NOT a bidi/reading-order statement — advance direction is a
 * glyph-sequence concern, carried separately where consumers need it.
 *
 * Degenerate glyphs carry a zeroed `looseQuad` plus the empty flag (bit 2),
 * mirroring the upright variant's zeroed-box convention. `flags` bits match
 * {@link PageGeometryGlyph.flags}.
 */
export interface RotatedGeometryGlyph {
  looseQuad: PdfQuad;
  flags: number;
  tightQuad?: PdfQuad;
}

/**
 * A run whose char matrix is upright — byte-identical to the wire shape that
 * predates orientation support, so upright documents never pay for it.
 */
export interface UprightGeometryRun {
  rect: PdfRect;
  charStart: number;
  glyphs: PageGeometryGlyph[];
  fontSize?: number;
}

/**
 * A run whose char matrix is NOT upright (rotated, sheared, or mirrored).
 *
 * `rect` stays a page-space AABB (culling), like every other wire rect.
 * `rotation` is the baseline angle in radians, CCW in PDF y-up space
 * (`atan2(m.b, m.a)` of the run's char matrix). Note a shear-only run has
 * `rotation === 0` and still uses this variant — its cells are
 * parallelograms an AABB would misrepresent. `ascentFlip` is true when the
 * ascent vector maps opposite the rotated frame's +y (mirrored /
 * negative-determinant content).
 */
export interface RotatedGeometryRun {
  rect: PdfRect;
  charStart: number;
  glyphs: RotatedGeometryGlyph[];
  rotation: number;
  ascentFlip: boolean;
  fontSize?: number;
}

/**
 * One text run (contiguous glyphs sharing a text object and orientation).
 * A discriminated union so consumers CANNOT read axis-aligned boxes off
 * rotated text by accident — handling orientation is a compile-time
 * obligation, not a runtime discovery. Narrow with
 * {@link isRotatedGeometryRun}, or use the uniform {@link glyphLooseQuad} /
 * {@link glyphLooseBounds} views.
 */
export type PageGeometryRun = UprightGeometryRun | RotatedGeometryRun;

/**
 * Geometry-only text layout for one page, in PDF user space (y-up). The v3
 * viewer converts to content/view space via the page geometry matrix.
 *
 * Pure content, addressed and cached by `contentVersion`. Carries NO
 * annotation liveness envelope (`PageState`) — see `PageTextSnapshot` for
 * the rationale; liveness lives on annotation reads.
 */
export interface PageGeometrySnapshot {
  runs: PageGeometryRun[];
}

/** Narrowing guard: is this run the rotated (non-upright) variant? */
export function isRotatedGeometryRun(run: PageGeometryRun): run is RotatedGeometryRun {
  return 'rotation' in run;
}

/**
 * Uniform oriented-cell view over either run variant: the glyph's loose cell
 * as a quad (synthesized from the box corners when the run is upright, in
 * the same frame-geometric slot order).
 */
export function glyphLooseQuad(run: PageGeometryRun, index: number): PdfQuad {
  if (isRotatedGeometryRun(run)) return run.glyphs[index].looseQuad;
  const b = run.glyphs[index].looseBox;
  return {
    p1: { x: b.left, y: b.top },
    p2: { x: b.right, y: b.top },
    p3: { x: b.left, y: b.bottom },
    p4: { x: b.right, y: b.bottom },
  };
}

/**
 * Uniform AABB view over either run variant: the glyph's loose box, or the
 * enclosing bounds of its oriented cell when the run is rotated. The
 * conservative envelope for consumers that genuinely want a box (culling,
 * scroll targets) — never a substitute for handling orientation in geometry
 * that gets DRAWN.
 */
export function glyphLooseBounds(run: PageGeometryRun, index: number): PdfRect {
  if (isRotatedGeometryRun(run)) return pdfQuadBounds(run.glyphs[index].looseQuad);
  return run.glyphs[index].looseBox;
}
