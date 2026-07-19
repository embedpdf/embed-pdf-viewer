import type { PdfRect } from '../geometry/primitives';

/**
 * One glyph's geometry in PDF user space (y-up edges).
 *
 * `looseBox` is the loose char box (pdfium `FPDFText_GetLooseCharBox`): the
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
 * One text run (contiguous glyphs sharing a text object). `rect` is the run's
 * enclosing box in PDF user space (y-up edges).
 */
export interface PageGeometryRun {
  rect: PdfRect;
  charStart: number;
  glyphs: PageGeometryGlyph[];
  fontSize?: number;
}

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
