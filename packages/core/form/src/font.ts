/**
 * A font as the engine's text layout reads it: a character's width, the
 * ascent and the descent, all in 1/1000 em. The same three questions PDFium's
 * layout asks its font (`CPVT_VariableText::Provider`), so a layout with
 * these numbers places every glyph where the engine places it.
 *
 * Only the 14 standard fonts have their numbers here, from the built-in faces
 * the engine draws them with (`@embedpdf/core-fonts`). Any other font gives
 * `null`, and a widget in it draws approximately.
 */
import { standardFontMetrics } from '@embedpdf/core-fonts';
import { isStandardFontName, type StandardFont } from '@embedpdf/engine-core/runtime';

export interface LayoutFont {
  /** The standard font it is, as the engine draws it. */
  readonly font: StandardFont;
  /** In 1/1000 em. */
  readonly ascent: number;
  /** In 1/1000 em, below the baseline (negative). */
  readonly descent: number;
  /**
   * A UTF-16 code unit's width; `null` when the font can't write it (the
   * engine then draws it in another font, so the layout is approximate).
   */
  width(code: number): number | null;
}

const fonts = new Map<StandardFont, LayoutFont>();

/** The layout numbers of a widget's `/DA` font; `null` for a font that isn't one of the 14. */
export function layoutFontOf(fontFamily: string | null | undefined): LayoutFont | null {
  if (!fontFamily || !isStandardFontName(fontFamily)) return null;
  const known = fonts.get(fontFamily);
  if (known) return known;
  const metrics = standardFontMetrics(fontFamily);
  const font: LayoutFont = {
    font: fontFamily,
    ascent: metrics.ascent,
    descent: metrics.descent,
    width: (code) => metrics.advance(code),
  };
  fonts.set(fontFamily, font);
  return font;
}
