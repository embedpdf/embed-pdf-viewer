/**
 * The selection plugin's view of a page's text. Segmentation, hit-testing,
 * and word/line expansion live in the canonical engine-core text layout: a
 * text range has exactly one segmentation whether it came from a drag or a
 * search. The layout is in page space, the viewer's own space, so pointer
 * points go in as they are and segments come out ready to draw.
 */
import type { PdfTextSegment } from '@embedpdf/engine-core/runtime';

/**
 * One merged visual line of a selection, as the engine's layout gives it.
 * `quad` carries the corners, named in the line's own frame; `advance` is the
 * reading direction along the baseline (+1 = toward the right end), derived
 * from the glyph sequence, so geometry and bidi stay separate concerns.
 * `rect` is its bounding box.
 */
export type SelectionSegment = PdfTextSegment;
