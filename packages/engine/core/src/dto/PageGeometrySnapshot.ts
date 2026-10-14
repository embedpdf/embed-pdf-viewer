import { pdfQuadBounds } from '../geometry/convert';
import type { PdfQuad, PdfRect } from '../geometry/primitives';
import type { Coordinates, PageCoordinates, PdfCoordinates } from '../pageSpace/coordinates';

/**
 * One upright character's geometry: its boxes, in page space.
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
export interface PageGeometryGlyph<C extends Coordinates = PageCoordinates> {
  loose: C['box'];
  tight?: C['box'];
  space?: true;
  empty?: true;
}

/**
 * One non-upright character's geometry: the exact oriented cells, in page
 * space (not a local frame). Each cell's corners are named in the glyph's
 * own upright frame, as every quad's are (see `PdfQuad`).
 *
 * Degenerate glyphs carry a zeroed `loose` quad and `empty`, mirroring the
 * upright variant's zeroed-box convention.
 */
export interface RotatedGeometryGlyph<C extends Coordinates = PageCoordinates> {
  loose: C['quad'];
  tight?: C['quad'];
  space?: true;
  empty?: true;
}

/**
 * A run whose char matrix is upright — byte-identical to the wire shape that
 * predates orientation support, so upright documents never pay for it.
 */
export interface UprightGeometryRun<C extends Coordinates = PageCoordinates> {
  rect: C['box'];
  /** The run's first character; it covers `glyphs.length` characters from here. */
  start: number;
  glyphs: PageGeometryGlyph<C>[];
  fontSize?: number;
}

/**
 * A run whose char matrix is not upright (rotated, sheared, or mirrored).
 *
 * `rect` stays a page-space AABB (culling), like every other wire rect.
 * `rotation` is how far the text is turned from upright, in degrees
 * clockwise as the page shows it (0 up to 360), like every other `rotation`:
 * text that reads straight up the page is 270. Note a shear-only run has
 * `rotation === 0` and still uses this variant — its cells are
 * parallelograms an AABB would misrepresent. `ascentFlip` is true when the
 * ascent vector maps opposite the rotated frame's +y (mirrored /
 * negative-determinant content).
 */
export interface RotatedGeometryRun<C extends Coordinates = PageCoordinates> {
  rect: C['box'];
  /** The run's first character; it covers `glyphs.length` characters from here. */
  start: number;
  glyphs: RotatedGeometryGlyph<C>[];
  /** Degrees clockwise, 0 up to 360. */
  rotation: number;
  ascentFlip: boolean;
  fontSize?: number;
}

/**
 * One text run (contiguous glyphs sharing a text object and orientation).
 * A discriminated union so consumers cannot read axis-aligned boxes off
 * rotated text by accident — handling orientation is a compile-time
 * obligation, not a runtime discovery. Narrow with
 * {@link isRotatedGeometryRun}, or use the uniform `pageGlyphLooseQuad` /
 * `pageGlyphLooseBounds` views.
 */
export type PageGeometryRun<C extends Coordinates = PageCoordinates> =
  | UprightGeometryRun<C>
  | RotatedGeometryRun<C>;

/**
 * Geometry-only text layout for one page, in page space: points from the
 * top-left of the page's visible box, y down.
 *
 * Pure content, addressed and cached by `contentVersion`.
 */
export interface PageGeometrySnapshot<C extends Coordinates = PageCoordinates> {
  runs: PageGeometryRun<C>[];
}

/** Narrowing guard: is this run the rotated (non-upright) variant? */
export function isRotatedGeometryRun<C extends Coordinates>(
  run: PageGeometryRun<C>,
): run is RotatedGeometryRun<C> {
  return 'rotation' in run;
}

/**
 * Uniform oriented-cell view over either run variant, in the file's
 * coordinates: the glyph's loose cell as a quad (synthesized from the box
 * corners when the run is upright).
 */
export function glyphLooseQuad(run: PageGeometryRun<PdfCoordinates>, index: number): PdfQuad {
  if (isRotatedGeometryRun(run)) return run.glyphs[index].loose;
  const b = run.glyphs[index].loose;
  return {
    upperLeft: { x: b.left, y: b.top },
    upperRight: { x: b.right, y: b.top },
    lowerLeft: { x: b.left, y: b.bottom },
    lowerRight: { x: b.right, y: b.bottom },
  };
}

/**
 * Uniform AABB view over either run variant, in the file's coordinates: the
 * glyph's loose box, or the
 * enclosing bounds of its oriented cell when the run is rotated. The
 * conservative envelope for consumers that genuinely want a box (culling,
 * scroll targets) — never a substitute for handling orientation in geometry
 * that gets drawn.
 */
export function glyphLooseBounds(run: PageGeometryRun<PdfCoordinates>, index: number): PdfRect {
  if (isRotatedGeometryRun(run)) return pdfQuadBounds(run.glyphs[index].loose);
  return run.glyphs[index].loose;
}
