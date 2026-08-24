/**
 * Text folding for literal search: the deterministic normalization applied
 * to BOTH the page text and the needle so that "Café" finds "cafe" and a
 * line-wrapped "hello\n  world" finds "hello world".
 *
 * Fold version 1:
 *   - whitespace runs collapse to a single space (any `\s`, including the
 *     spaces some compatibility decompositions emit),
 *   - each code point is NFKD-decomposed (ligatures split: "ﬁ" → "fi",
 *     "²" → "2"),
 *   - combining marks are stripped unless `keepMarks`,
 *   - case is folded via upper→lower round-trip unless `keepCase` (this
 *     poor-man's full fold catches "ß"→"ss" and "ς"→"σ", which a plain
 *     `toLowerCase` misses).
 *
 * Every folded code unit remembers which original code point produced it
 * (`map`), so match ranges found in folded space translate back to exact
 * original-text ranges — the property the whole anchor stage rests on.
 *
 * Pre-folded corpus artifacts store this fold's output; bump
 * `SEARCH_FOLD_VERSION` on ANY semantic change so stored corpora are
 * rebuilt instead of silently mismatching fresh needles.
 */

/** Version stamp for persisted pre-folded corpus artifacts. */
export const SEARCH_FOLD_VERSION = 1;

export interface FoldOptions {
  /** Preserve case (matchCase). */
  keepCase?: boolean;
  /** Preserve combining marks (matchDiacritics). */
  keepMarks?: boolean;
}

export interface FoldedText {
  folded: string;
  /** Folded code unit i → code-unit index of the original code point it came from. */
  map: Uint32Array;
  original: string;
}

/** A half-open match range in ORIGINAL code-unit space. */
export interface SearchMatchRange {
  start: number;
  length: number;
}

const WHITESPACE = /\s/;
const MARKS = /\p{M}/gu;

export function foldText(original: string, options: FoldOptions = {}): FoldedText {
  const units: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;

  let index = 0;
  for (const cp of original) {
    let piece: string;
    if (WHITESPACE.test(cp)) {
      piece = ' ';
    } else {
      piece = cp.normalize('NFKD');
      if (!options.keepMarks) piece = piece.replace(MARKS, '');
      if (!options.keepCase) piece = piece.toUpperCase().toLowerCase();
    }
    // A decomposition can itself contain whitespace (U+00A8 → space +
    // combining diaeresis), so collapse runs at the unit level, not just
    // for source whitespace.
    for (let u = 0; u < piece.length; u++) {
      const unit = piece[u];
      if (WHITESPACE.test(unit)) {
        if (lastWasSpace) continue;
        units.push(' ');
        map.push(index);
        lastWasSpace = true;
      } else {
        units.push(unit);
        map.push(index);
        lastWasSpace = false;
      }
    }
    index += cp.length;
  }

  return { folded: units.join(''), map: Uint32Array.from(map), original };
}

/** Code-unit length of the code point starting at `index` (1 or 2). */
function codePointLengthAt(text: string, index: number): number {
  const unit = text.charCodeAt(index);
  if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
    const next = text.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return 2;
  }
  return 1;
}

/**
 * Translate a match found in folded space back to the original text.
 * The range covers whole original code points: a hit on either folded
 * half of "ﬁ" spans the full ligature, and a hit ending on a collapsed
 * space extends only through the first whitespace char of the run (the
 * remainder is presentation, not match).
 */
export function toOriginalRange(
  folded: FoldedText,
  foldedStart: number,
  foldedLength: number,
): SearchMatchRange {
  const start = folded.map[foldedStart];
  const lastOriginal = folded.map[foldedStart + foldedLength - 1];
  const end = lastOriginal + codePointLengthAt(folded.original, lastOriginal);
  return { start, length: end - start };
}
