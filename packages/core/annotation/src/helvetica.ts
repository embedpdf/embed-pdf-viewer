/**
 * Helvetica as the engine sets it. A label or caption that names no other
 * font is drawn in Helvetica, so measuring with these numbers lays text out
 * where the engine will, independent of the fonts a browser has.
 */

// Standard Helvetica advances in 1/1000 em, ASCII 32–126.
const ADVANCES = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Superscripts and typographic primes, which the built-in unit formats use.
const EXTRA_ADVANCES: Record<string, number> = {
  '²': 333,
  '³': 333,
  '′': 191,
  '″': 355,
  '−': 584,
  ' ': 278,
};

/** From a line's top to its baseline, in em. */
export const HELVETICA_ASCENT = 0.962;

/** From one line's top to the next, in em. */
export const HELVETICA_LINE_HEIGHT = 1.169;

/**
 * How far `text` advances, in em. A character without a width here counts as
 * wide as a digit.
 */
export function helveticaAdvance(text: string): number {
  let advance = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    advance += ADVANCES[code - 32] ?? EXTRA_ADVANCES[character] ?? 556;
  }
  return advance / 1000;
}
