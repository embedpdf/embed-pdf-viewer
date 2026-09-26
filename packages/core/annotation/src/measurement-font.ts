export const DISTANCE_CAPTION_SIZE = 9;

// Standard Helvetica advances in 1/1000 em, ASCII 32–126. Distance authoring
// uses the same base font as the native caption fallback. Keep this independent
// of browser font substitution and available to headless callers.
const HELVETICA_ADVANCES = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const EXTRA_ADVANCES: Record<string, number> = {
  '²': 333,
  '³': 333,
  '′': 191,
  '″': 355,
  '−': 584,
  '\u00a0': 278,
};

export function distanceCaptionWidth(text: string): number {
  let advance = 0;

  for (const character of text.trimEnd()) {
    const code = character.codePointAt(0)!;
    // Superscripts and typographic primes cover the built-in unit formats.
    const extra = EXTRA_ADVANCES[character] ?? 556;

    advance += HELVETICA_ADVANCES[code - 32] ?? extra;
  }

  return (advance * DISTANCE_CAPTION_SIZE) / 1000;
}
