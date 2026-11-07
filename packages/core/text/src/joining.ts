/**
 * Which letters of a cursive script join (Arabic, Syriac, N'Ko, Mongolian…),
 * as the engine's shaper reads Unicode's joining types: a letter takes its
 * joined form on each side where it and its neighbour both join. Marks between
 * them don't stop it.
 */
import { codePointsOf } from './graphemes';
import { JOINING_TYPES } from './joining.generated';

/**
 * Unicode's Joining_Type: `D` joins on both sides, `R` only the character
 * before it (in typing order), `L` only the one after, `C` causes joining on
 * both, `T` is see-through (a mark), `U` joins nothing.
 */
export type JoiningType = (typeof JOINING_TYPES)[number][2];

const TRANSPARENT = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

/** A character's joining type: the table's, else see-through for a mark or a format character. */
export function joiningTypeOf(codePoint: number): JoiningType {
  let low = 0;
  let high = JOINING_TYPES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last, type] = JOINING_TYPES[middle]!;
    if (codePoint < first) high = middle - 1;
    else if (codePoint > last) low = middle + 1;
    else return type;
  }
  return TRANSPARENT.test(String.fromCodePoint(codePoint)) ? 'T' : 'U';
}

/** A grapheme's joining type: its first character's that isn't see-through. */
export function graphemeJoiningType(grapheme: string): JoiningType {
  for (const codePoint of codePointsOf(grapheme)) {
    const type = joiningTypeOf(codePoint);
    if (type !== 'T') return type;
  }
  return 'T';
}

const joinsBefore = (type: JoiningType) => type === 'D' || type === 'R' || type === 'C';
const joinsAfter = (type: JoiningType) => type === 'D' || type === 'L' || type === 'C';

/** Where a grapheme joins its neighbours: the one before it and the one after, in typing order. */
export interface Joins {
  readonly previous: boolean;
  readonly next: boolean;
}

/**
 * Where each of `graphemes` joins its neighbours, shaped together: a pair
 * joins when the first joins what follows it and the second what precedes
 * it, see-through graphemes between them skipped. `together(a, b)` says
 * whether two graphemes are shaped as one (the same font and direction).
 */
export function joinsOf(
  graphemes: readonly string[],
  together: (a: number, b: number) => boolean = () => true,
): Joins[] {
  const types = graphemes.map(graphemeJoiningType);
  const joins = graphemes.map(() => ({ previous: false, next: false }));
  let before = -1;
  types.forEach((type, index) => {
    if (type === 'T') return;
    if (before >= 0 && joinsAfter(types[before]!) && joinsBefore(type) && together(before, index)) {
      joins[before]!.next = true;
      joins[index]!.previous = true;
    }
    before = index;
  });
  return joins;
}

/** U+200D: next to a letter drawn alone, it gives the letter the form joined on that side. */
const ZERO_WIDTH_JOINER = '\u200d';

/** `grapheme` with a joiner on each side `joins` names: drawn alone, it takes its joined form. */
export const joinedText = (grapheme: string, joins: Joins): string =>
  `${joins.previous ? ZERO_WIDTH_JOINER : ''}${grapheme}${joins.next ? ZERO_WIDTH_JOINER : ''}`;
