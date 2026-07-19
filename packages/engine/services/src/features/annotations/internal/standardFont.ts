import type { FreeTextFont, StandardFont } from '@embedpdf/engine-core/runtime';

/**
 * `FPDF_STANDARD_FONT` enum codes (the 14 standard PDF fonts) mapped to the
 * wire-stable kebab-case `StandardFont` strings. We keep this PDFium-specific
 * mapping in engine-services so engine-core stays free of any PDFium
 * dependency (mirrors `lineEnding.ts` / `shapeBorderStyle.ts`).
 *
 *   Courier=0, Courier-Bold=1, Courier-BoldOblique=2, Courier-Oblique=3,
 *   Helvetica=4, Helvetica-Bold=5, Helvetica-BoldOblique=6,
 *   Helvetica-Oblique=7, Times-Roman=8, Times-Bold=9, Times-BoldItalic=10,
 *   Times-Italic=11, Symbol=12, ZapfDingbats=13
 */
const FONT_TO_CODE: Record<StandardFont, number> = {
  courier: 0,
  'courier-bold': 1,
  'courier-bold-oblique': 2,
  'courier-oblique': 3,
  helvetica: 4,
  'helvetica-bold': 5,
  'helvetica-bold-oblique': 6,
  'helvetica-oblique': 7,
  'times-roman': 8,
  'times-bold': 9,
  'times-bold-italic': 10,
  'times-italic': 11,
  symbol: 12,
  'zapf-dingbats': 13,
};

const CODE_TO_FONT: Record<number, StandardFont> = Object.fromEntries(
  Object.entries(FONT_TO_CODE).map(([font, code]) => [code, font as StandardFont]),
) as Record<number, StandardFont>;

/** Default when a `/DA` font is missing or unrecognised. */
export const DEFAULT_STANDARD_FONT: StandardFont = 'helvetica';

export function standardFontToCode(font: StandardFont): number {
  return FONT_TO_CODE[font] ?? FONT_TO_CODE[DEFAULT_STANDARD_FONT];
}

/**
 * Narrow a FreeText `fontFamily` to one of the 14 standard fonts. A `false`
 * result means the value is a registered-font `key`. The standard names are
 * therefore reserved — a registered font keyed `'helvetica'` resolves as the
 * standard font.
 */
export function isStandardFont(font: FreeTextFont): font is StandardFont {
  return Object.prototype.hasOwnProperty.call(FONT_TO_CODE, font);
}

export function standardFontFromCode(code: number): StandardFont {
  return CODE_TO_FONT[code] ?? DEFAULT_STANDARD_FONT;
}
