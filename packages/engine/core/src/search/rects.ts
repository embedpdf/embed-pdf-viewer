import type { PageGeometrySnapshot } from '../dto/PageGeometrySnapshot';
import type { PdfRect } from '../geometry/primitives';
import { buildPageTextLayout, textSegmentsForRange, type PdfTextSegment } from '../text/layout';

/**
 * Match-range → canonical visual-line segments. Thin wrappers over the ONE
 * text layout (`src/text/layout.ts`) — search owns matching and cursors,
 * never segmentation, so a match highlights exactly like a selection of the
 * same characters. No frame or merge logic lives here.
 */

/** Canonical segments for `[charStart, charStart + charCount)`. */
export function searchSegmentsForRange(
  snapshot: PageGeometrySnapshot,
  charStart: number,
  charCount: number,
): PdfTextSegment[] {
  return textSegmentsForRange(buildPageTextLayout(snapshot), charStart, charCount);
}

/** The segments' AABBs — for consumers that genuinely want boxes. */
export function searchRectsForRange(
  snapshot: PageGeometrySnapshot,
  charStart: number,
  charCount: number,
): PdfRect[] {
  return searchSegmentsForRange(snapshot, charStart, charCount).map((s) => s.rect);
}
