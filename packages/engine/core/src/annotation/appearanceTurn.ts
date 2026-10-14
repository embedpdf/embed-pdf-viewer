import { isSamePdfRect, pdfRectTurnedBounds } from '../geometry/convert';
import type { PdfRect } from '../geometry/primitives';

/** The kinds drawn about a box that can turn. */
const BOX_KINDS: ReadonlySet<string> = new Set(['square', 'circle', 'free-text', 'stamp', 'caret']);

/**
 * The turn an annotation's appearance raster is drawn without, degrees
 * clockwise, or `null` when the raster is drawn as the page shows it. A box
 * kind drawn turned whose drawing stays inside the turned box (its `rect` is
 * the upright box around it) renders upright over its `box`, for the
 * consumer to turn about the middle of `box`: a new turn needs no new
 * raster. A callout (its line isn't turned) and a drawing that reaches past
 * its box (a cloudy border's bumps) render as the page shows them, placed by
 * `rect`.
 */
export function pdfAppearanceTurnOf(annotation: {
  subtype: string;
  rect: PdfRect;
  box?: PdfRect | null;
  rotation?: number | null;
  intent?: string | null;
}): number | null {
  const { subtype, rect, box, rotation, intent } = annotation;
  if (!BOX_KINDS.has(subtype) || !box || !rotation) return null;
  if (subtype === 'free-text' && intent === 'free-text-callout') return null;
  return isSamePdfRect(pdfRectTurnedBounds(box, rotation), rect) ? rotation : null;
}
