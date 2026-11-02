/**
 * Fonts a browser draws laid-out text with: each one as the layout reads it
 * (a `TextFont`), with the program and the CSS a browser draws it with. A
 * viewer that knows the document's fonts gives a box's face, the fallbacks in
 * the order the engine tries them for its style and the last resort
 * (`PaintFonts`); without them a box draws in its standard font, or
 * Helvetica, with only the last resort behind it (`defaultPaintFonts`).
 */
import {
  LAST_RESORT_HASH,
  LAST_RESORT_METRICS,
  fontProgramFamily,
  lastResortFontProgram,
  standardFontCss,
  standardFontOf,
  standardFontProgram,
  type MountableFontProgram,
} from '@embedpdf/core-fonts';
import {
  type CodePointRange,
  type FontProgramInfo,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';

import { standardTextFont, type TextFont, type TextFonts } from './fonts';

/** A font a browser draws with. */
export interface PaintFont extends TextFont {
  /** The CSS family list that draws it, its program's family first. */
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
  /** The program it draws with: whatever draws the text mounts it. */
  readonly program: MountableFontProgram;
}

/** The fonts a box's text is drawn with. */
export type PaintFonts = TextFonts<PaintFont>;

const standardFonts = new Map<StandardFont, PaintFont>();

/** A standard font, as the engine draws it with its built-in face. */
export function standardPaintFont(font: StandardFont): PaintFont {
  const known = standardFonts.get(font);
  if (known) return known;
  const { fontFamily, fontWeight, fontStyle } = standardFontCss(font);
  const paintFont: PaintFont = {
    ...standardTextFont(font),
    fontFamily,
    fontWeight,
    fontStyle,
    program: standardFontProgram(font),
  };
  standardFonts.set(font, paintFont);
  return paintFont;
}

/**
 * A font program the engine draws with, as a browser draws it: the characters
 * it covers and its line metrics as the engine reads them
 * (`doc.fonts.getProgram`), and its widths from `measure`, the browser's own
 * shaping of the mounted program, in thousandths of the font size.
 */
export function programPaintFont(
  info: FontProgramInfo,
  program: MountableFontProgram,
  measure: (text: string, rtl: boolean) => number,
): PaintFont {
  const covers = coverageOf(info.covers);
  return {
    key: program.hash,
    ascent: info.ascent,
    descent: info.descent,
    standard: false,
    covers,
    width: measure,
    fontFamily: `"${program.family}"`,
    fontWeight: program.weight,
    fontStyle: program.style,
    program,
  };
}

/** Whether a code point is in `ranges`: a binary search over them, in order. */
function coverageOf(ranges: readonly CodePointRange[]): (codePoint: number) => boolean {
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  return (codePoint) => {
    let low = 0;
    let high = sorted.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const { start, count } = sorted[middle]!;
      if (codePoint < start) high = middle - 1;
      else if (codePoint >= start + count) low = middle + 1;
      else return true;
    }
    return false;
  };
}

const ZERO_WIDTH_JOINER = 0x200d;
const isVariationSelector = (codePoint: number) =>
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);

let lastResort: PaintFont | undefined;

/**
 * The last-resort font: one box for every character from U+0020 up, each as
 * wide as the box the engine draws (joiners and variation selectors draw
 * nothing).
 */
export function lastResortPaintFont(): PaintFont {
  if (lastResort) return lastResort;
  const program = lastResortFontProgram();
  lastResort = {
    key: LAST_RESORT_HASH,
    ascent: LAST_RESORT_METRICS.ascent,
    descent: LAST_RESORT_METRICS.descent,
    standard: false,
    covers: (codePoint) => codePoint >= 0x20 && (codePoint < 0xd800 || codePoint > 0xdfff),
    width: (text) => {
      let width = 0;
      for (const character of text) {
        const codePoint = character.codePointAt(0)!;
        if (codePoint !== ZERO_WIDTH_JOINER && !isVariationSelector(codePoint)) {
          width += LAST_RESORT_METRICS.advance;
        }
      }
      return width;
    },
    fontFamily: `"${fontProgramFamily(LAST_RESORT_HASH)}"`,
    fontWeight: program.weight,
    fontStyle: program.style,
    program,
  };
  return lastResort;
}

/**
 * The fonts a box draws with when the viewer gives none: its standard font
 * (Helvetica for any other), no fallbacks, and the last resort.
 */
export function defaultPaintFonts(fontFamily: string | null | undefined): PaintFonts {
  return {
    face: standardPaintFont(standardFontOf(fontFamily ?? 'helvetica')),
    fallbacks: [],
    lastResort: lastResortPaintFont(),
  };
}
