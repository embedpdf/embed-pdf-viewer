import { pdfQuadBounds } from '../geometry/convert';
import type { PdfQuad, PdfRect } from '../geometry/primitives';

/**
 * One upright character's geometry in PDF user space (y-up edges).
 *
 * `loose` is the loose char cell (pdfium `FPDFText_GetLooseCharBox`): the
 * font-metric box covering the full glyph cell without regard to the actual
 * glyph shape. Always present (zeroed and `empty` for degenerate glyphs);
 * it's the box selection envelopes are built from.
 *
 * `tight` is the tight char box (pdfium `FPDFText_GetCharBox`): the box
 * hugging the actual glyph shape. Optional — absent for empty/whitespace
 * glyphs that have no real outline.
 *
 * `space` and `empty` are present, and `true`, only for a space and for a
 * character with no box of its own.
 */
export interface PageGeometryGlyph {
  loose: PdfRect;
  tight?: PdfRect;
  space?: true;
  empty?: true;
}

/**
 * One non-upright character's geometry: the exact oriented cells, in PDF
 * user space (page coordinates — not a local frame). The corner slots are
 * frame-geometric in the glyph's own upright frame:
 * `p1` = upper-start, `p2` = upper-end, `p3` = lower-start, `p4` = lower-end,
 * where "upper" is the ascent side and "start" is the frame's minimum-x side.
 * Deliberately not a bidi/reading-order statement — advance direction is a
 * glyph-sequence concern, carried separately where consumers need it.
 *
 * Degenerate glyphs carry a zeroed `loose` quad and `empty`, mirroring the
 * upright variant's zeroed-box convention.
 */
export interface RotatedGeometryGlyph {
  loose: PdfQuad;
  tight?: PdfQuad;
  space?: true;
  empty?: true;
}

/**
 * A run whose char matrix is upright — byte-identical to the wire shape that
 * predates orientation support, so upright documents never pay for it.
 */
export interface UprightGeometryRun {
  rect: PdfRect;
  /** The run's first character; it covers `glyphs.length` characters from here. */
  start: number;
  glyphs: PageGeometryGlyph[];
  fontSize?: number;
}

/**
 * A run whose char matrix is not upright (rotated, sheared, or mirrored).
 *
 * `rect` stays a page-space AABB (culling), like every other wire rect.
 * `baselineAngle` is the baseline's angle in radians, CCW in PDF y-up space
 * (`atan2(m.b, m.a)` of the run's char matrix) — math data, not a
 * `rotation`, which in the API is always degrees clockwise. Note a
 * shear-only run has `baselineAngle === 0` and still uses this variant — its cells are
 * parallelograms an AABB would misrepresent. `ascentFlip` is true when the
 * ascent vector maps opposite the rotated frame's +y (mirrored /
 * negative-determinant content).
 */
export interface RotatedGeometryRun {
  rect: PdfRect;
  /** The run's first character; it covers `glyphs.length` characters from here. */
  start: number;
  glyphs: RotatedGeometryGlyph[];
  baselineAngle: number;
  ascentFlip: boolean;
  fontSize?: number;
}

/**
 * One text run (contiguous glyphs sharing a text object and orientation).
 * A discriminated union so consumers cannot read axis-aligned boxes off
 * rotated text by accident — handling orientation is a compile-time
 * obligation, not a runtime discovery. Narrow with
 * {@link isRotatedGeometryRun}, or use the uniform {@link glyphLooseQuad} /
 * {@link glyphLooseBounds} views.
 */
export type PageGeometryRun = UprightGeometryRun | RotatedGeometryRun;

/**
 * Geometry-only text layout for one page, in PDF user space (y-up). The
 * viewer converts to content/view space via the page geometry matrix.
 *
 * Pure content, addressed and cached by `contentVersion`. Carries no
 * annotation liveness envelope (`PageState`) — see `PageTextSnapshot` for
 * the rationale; liveness lives on annotation reads.
 */
export interface PageGeometrySnapshot {
  runs: PageGeometryRun[];
}

/** Narrowing guard: is this run the rotated (non-upright) variant? */
export function isRotatedGeometryRun(run: PageGeometryRun): run is RotatedGeometryRun {
  return 'baselineAngle' in run;
}

/**
 * Uniform oriented-cell view over either run variant: the glyph's loose cell
 * as a quad (synthesized from the box corners when the run is upright, in
 * the same frame-geometric slot order).
 */
export function glyphLooseQuad(run: PageGeometryRun, index: number): PdfQuad {
  if (isRotatedGeometryRun(run)) return run.glyphs[index].loose;
  const b = run.glyphs[index].loose;
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
 * that gets drawn.
 */
export function glyphLooseBounds(run: PageGeometryRun, index: number): PdfRect {
  if (isRotatedGeometryRun(run)) return pdfQuadBounds(run.glyphs[index].loose);
  return run.glyphs[index].loose;
}
