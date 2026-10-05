/**
 * Text folding for literal search: the deterministic normalization applied
 * to BOTH the page text and the needle so that "Café" finds "cafe" and a
 * line-wrapped "hello\n  world" finds "hello world".
 *
 * Fold version 2:
 *   - PDFium line-break hyphen markers are stripped: U+FFFE is the synthetic
 *     character our PDFium fork inserts at a column-break hyphenation point
 *     (where a word is split across two text runs, e.g. "con" + U+FFFE +
 *     "tainers"). U+FFFE has no valid printable meaning and is silently
 *     dropped so that "containers" finds "con\uFFFEtainers".
 *     As a secondary guard, a U+002D `-` immediately followed by whitespace
 *     (an alternative encoding some producers use) is also suppressed along
 *     with its trailing whitespace run.
 *     Real hyphens in compound words ("lock-in") are never followed by
 *     whitespace and are preserved as before.
 *   - whitespace runs collapse to a single space (any `\s`, including the
 *     spaces some compatibility decompositions emit) — or are dropped
 *     entirely with `dropWhitespace` (ignoreWhitespace),
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
export const SEARCH_FOLD_VERSION = 2;

export interface FoldOptions {
  /** Preserve case (matchCase). */
  keepCase?: boolean;
  /** Preserve combining marks (matchDiacritics). */
  keepMarks?: boolean;
  /** Drop whitespace instead of collapsing it to one space (ignoreWhitespace). */
  dropWhitespace?: boolean;
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

/**
 * U+FFFE is the synthetic character our PDFium fork inserts at a
 * column-break hyphenation boundary between two text runs. It is never
 * a valid printable code point (it is a BOM/non-character), so it is
 * always safe to drop.
 */
const PDFIUM_LINE_BREAK_HYPHEN = '\uFFFE';

/**
 * Pre-scan: collect the code-unit indices of every U+002D `-` that is a
 * soft line-break hyphen — defined as a `-` immediately followed by
 * whitespace. These are suppressed during folding (along with their
 * trailing whitespace run) as a secondary guard for producers that emit a
 * literal hyphen+newline instead of U+FFFE at a column break.
 */
function findSoftHyphens(text: string): Set<number> {
  const hyphens = new Set<number>();
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '-' && WHITESPACE.test(text[i + 1])) {
      hyphens.add(i);
    }
  }
  return hyphens;
}

export function foldText(original: string, options: FoldOptions = {}): FoldedText {
  const units: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;

  const softHyphens = findSoftHyphens(original);

  let index = 0;
  for (const cp of original) {
    // U+FFFE: PDFium's synthetic line-break hyphen marker — drop silently.
    if (cp === PDFIUM_LINE_BREAK_HYPHEN) {
      index += cp.length;
      continue;
    }

    // U+002D followed by whitespace: soft line-break hyphen in an alternative
    // encoding — drop it and suppress the trailing whitespace run.
    if (cp === '-' && softHyphens.has(index)) {
      index += cp.length;
      lastWasSpace = true;
      continue;
    }

    let piece: string;
    if (WHITESPACE.test(cp)) {
      piece = ' ';
    } else {
      piece = cp.normalize('NFKD');
      if (!options.keepMarks) piece = piece.replace(MARKS, '');
      if (!options.keepCase) piece = piece.toUpperCase().toLowerCase();
    }
    // A decomposition can itself contain whitespace (U+00A8 → space +
    // combining diaeresis), so collapse (or drop) runs at the unit level,
    // not just for source whitespace.
    for (let u = 0; u < piece.length; u++) {
      const unit = piece[u];
      if (WHITESPACE.test(unit)) {
        if (options.dropWhitespace || lastWasSpace) continue;
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
