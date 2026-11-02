/**
 * Characters as the engine's text layout cuts them (`GraphemeStarts`,
 * `IsInvisibleGrapheme`): a grapheme is a character with the marks,
 * variation selectors and joined characters that follow it. Positions are
 * UTF-16 code units, as everywhere in JavaScript; a surrogate pair stays whole.
 */

const ZERO_WIDTH_JOINER = 0x200d;
const MARK = /\p{M}/u;

/** How many code units `codePoint` takes. */
export const unitsOf = (codePoint: number): number => (codePoint > 0xffff ? 2 : 1);

export const isMark = (codePoint: number): boolean => MARK.test(String.fromCodePoint(codePoint));

const isVariationSelector = (codePoint: number): boolean =>
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);

/** The code points of `text`, a surrogate pair as one. */
export function codePointsOf(text: string): number[] {
  const codePoints: number[] = [];
  for (let at = 0; at < text.length; ) {
    const codePoint = text.codePointAt(at)!;
    codePoints.push(codePoint);
    at += unitsOf(codePoint);
  }
  return codePoints;
}

/**
 * Where each grapheme of `text` starts, per code unit: a mark, a variation
 * selector, a joiner and the character after a joiner continue the grapheme
 * before them. A surrogate pair's second unit never starts one.
 */
export function graphemeStarts(text: string): boolean[] {
  const starts: boolean[] = new Array<boolean>(text.length).fill(false);
  let afterJoiner = false;
  for (let at = 0; at < text.length; ) {
    const codePoint = text.codePointAt(at)!;
    const continues =
      at > 0 &&
      (isMark(codePoint) ||
        isVariationSelector(codePoint) ||
        codePoint === ZERO_WIDTH_JOINER ||
        afterJoiner);
    starts[at] = !continues;
    afterJoiner = codePoint === ZERO_WIDTH_JOINER;
    at += unitsOf(codePoint);
  }
  return starts;
}

/** The graphemes of `text`, as `[begin, end)` code unit ranges. */
export function graphemesOf(text: string): [number, number][] {
  const starts = graphemeStarts(text);
  const graphemes: [number, number][] = [];
  for (let begin = 0; begin < text.length; ) {
    let end = begin + 1;
    while (end < text.length && !starts[end]) end += 1;
    graphemes.push([begin, end]);
    begin = end;
  }
  return graphemes;
}

/**
 * Whether a font needs a glyph for `codePoint` to cover it: joiners and
 * variation selectors draw nothing of their own.
 */
export const needsGlyph = (codePoint: number): boolean =>
  codePoint !== ZERO_WIDTH_JOINER && !isVariationSelector(codePoint);

/** A grapheme that draws nothing: controls, format characters, fillers. */
export function isInvisibleGrapheme(grapheme: string): boolean {
  return codePointsOf(grapheme).every(
    (cp) =>
      cp < 0x20 ||
      (cp >= 0x7f && cp <= 0x9f) ||
      cp === 0x00ad ||
      cp === 0x034f ||
      cp === 0x061c ||
      (cp >= 0x115f && cp <= 0x1160) ||
      (cp >= 0x17b4 && cp <= 0x17b5) ||
      (cp >= 0x180b && cp <= 0x180f) ||
      (cp >= 0x200b && cp <= 0x200f) ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2060 && cp <= 0x206f) ||
      cp === 0x3164 ||
      (cp >= 0xfe00 && cp <= 0xfe0f) ||
      cp === 0xfeff ||
      cp === 0xffa0 ||
      (cp >= 0xfff0 && cp <= 0xfff8) ||
      (cp >= 0x1bca0 && cp <= 0x1bca3) ||
      (cp >= 0x1d173 && cp <= 0x1d17a) ||
      (cp >= 0xe0000 && cp <= 0xe0fff),
  );
}
