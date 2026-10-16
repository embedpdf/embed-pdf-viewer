/**
 * Editors laid out at a legible size and drawn at the page's. iOS Safari zooms the page in when
 * a field takes focus with text under 16 CSS pixels, to 16 over that size, and it reads the
 * field's own computed font size: a transform doesn't change that size (CSS `zoom` does). Text
 * on a page is drawn at the page's scale, so a form field or a text box on a phone often has
 * smaller text. Such an editor is laid out {@link legibleScaleOf} times bigger (its text, lines
 * and box alike), and a `scale()` from its top-left corner draws it back at the page's size: the
 * same picture, with text iOS reads as legible. Every other browser draws it the same way.
 */

/** The smallest text, in CSS pixels, a field takes focus with on iOS without the page zooming in. */
export const LEGIBLE_FONT_PX = 16;

/**
 * How many times bigger to lay out an editor whose text is `fontPx` CSS pixels, so its text is
 * at least {@link LEGIBLE_FONT_PX}: 1 when it already is.
 */
export function legibleScaleOf(fontPx: number): number {
  return fontPx > 0 && fontPx < LEGIBLE_FONT_PX ? LEGIBLE_FONT_PX / fontPx : 1;
}

/**
 * The transform that draws an element laid out `legible` times bigger back at its size, from its
 * top-left corner (`transformOrigin: '0 0'`), or null when it is laid out at its size.
 */
export function legibleShrinkOf(legible: number): string | null {
  return legible === 1 ? null : `scale(${1 / legible})`;
}
