/**
 * The selection plugin's view of a page's text. Segmentation, hit-testing,
 * and word/line expansion live in the canonical engine-core text layout: a
 * text range has exactly one segmentation whether it came from a drag or a
 * search. The layout is in page space, the viewer's own space, so pointer
 * points go in as they are and segments come out ready to draw; this module
 * only names a quad's corners.
 */
import { textQuadFromPositional, type Rect, type TextQuad } from '@embedpdf/core-geometry';
import type { PdfTextSegment } from '@embedpdf/engine-core/runtime';

/**
 * One merged visual line of a selection — the engine's `PdfTextSegment` with
 * its quad's corners named. `quad` carries frame-geometric corner semantics
 * (upper = ascent side, start = the frame's −x); `advance` is the reading
 * direction along the baseline (+1 = toward `end`), derived from the glyph
 * sequence — geometry and bidi stay separate concerns. `rect` is its
 * bounding box.
 */
export interface SelectionSegment {
  quad: TextQuad;
  rect: Rect;
  advance: 1 | -1;
}

/** A layout segment as a selection segment. */
export function selectionSegmentOf(segment: PdfTextSegment): SelectionSegment {
  return {
    quad: textQuadFromPositional(segment.quad),
    rect: segment.rect,
    advance: segment.advance,
  };
}
