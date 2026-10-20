/**
 * The fonts a layout draws with, and which one draws each grapheme, as the
 * engine picks it (`MatchGrapheme`): the box's font if it has every character
 * of the grapheme, else the first fallback, in the order the engine tries
 * them for the box's style, that has them all, else the last-resort font,
 * which draws a box. A grapheme that draws nothing stays with the box's font.
 */
import { standardFontMetrics } from '@embedpdf/core-fonts';
import type { StandardFont } from '@embedpdf/engine-core/runtime';

import { mirrorOf } from './bidi';
import { codePointsOf, isInvisibleGrapheme, needsGlyph } from './graphemes';

/** A font as the layout reads it. */
export interface TextFont {
  /** What the caller names it by: a standard font's name, or its program's display hash. */
  readonly key: string;
  /** How far it reaches above the baseline, in thousandths of the font size. */
  readonly ascent: number;
  /** How far below, in thousandths of the font size, as a negative number. */
  readonly descent: number;
  /** Whether it has a glyph for `codePoint`. */
  covers(codePoint: number): boolean;
  /**
   * How wide `text` is in it, in thousandths of the font size: shaped as one
   * run, right to left when `rtl`, with the font's own features.
   */
  width(text: string, rtl: boolean): number;
  /**
   * Whether it is one of the 14 standard fonts: one glyph per character
   * through its encoding, no shaping.
   */
  readonly standard: boolean;
}

/** The fonts a box draws with. */
export interface TextFonts {
  /** The box's own font. */
  readonly face: TextFont;
  /** The fallbacks, in the order the engine tries them for the box's style. */
  readonly fallbacks: readonly TextFont[];
  /** The font that draws a box for a character no font has; `null` when there is none. */
  readonly lastResort: TextFont | null;
}

export interface GraphemeMatch {
  readonly font: TextFont;
  /** `false` when no font has the grapheme: it is drawn as a box, or not at all. */
  readonly covered: boolean;
}

/** Whether `font` has every character of `grapheme` that needs a glyph. */
export const coversGrapheme = (font: TextFont, grapheme: string): boolean =>
  codePointsOf(grapheme).every((codePoint) => !needsGlyph(codePoint) || font.covers(codePoint));

/** The font that draws `grapheme`. */
export function matchGrapheme(grapheme: string, fonts: TextFonts): GraphemeMatch {
  if (coversGrapheme(fonts.face, grapheme)) return { font: fonts.face, covered: true };
  const fallback = fonts.fallbacks.find((font) => coversGrapheme(font, grapheme));
  if (fallback) return { font: fallback, covered: true };
  const lastResort = isInvisibleGrapheme(grapheme) ? null : fonts.lastResort;
  return { font: lastResort ?? fonts.face, covered: false };
}

const standardFonts = new Map<StandardFont, TextFont>();

/**
 * A standard font as the engine draws it: its built-in face's advances and
 * line metrics, one glyph per character its encoding writes, a right-to-left
 * run's characters mirrored.
 */
export function standardTextFont(font: StandardFont): TextFont {
  const known = standardFonts.get(font);
  if (known) return known;
  const metrics = standardFontMetrics(font);
  const textFont: TextFont = {
    key: font,
    ascent: metrics.ascent,
    descent: metrics.descent,
    standard: true,
    covers: (codePoint) => codePoint <= 0xffff && metrics.advance(codePoint) !== null,
    width: (text, rtl) =>
      codePointsOf(text).reduce(
        (sum, codePoint) => sum + (metrics.advance(rtl ? mirrorOf(codePoint) : codePoint) ?? 0),
        0,
      ),
  };
  standardFonts.set(font, textFont);
  return textFont;
}
