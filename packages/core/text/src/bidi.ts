/**
 * The Unicode bidirectional algorithm (UAX #9) as the engine runs it with
 * ICU (`CFX_BidiParagraph`): a paragraph's levels at a given direction, the
 * levels of one of its lines (rule L1) and the order its runs are drawn in
 * (rule L2). The levels come from `bidi-js`, which reads code units: a
 * supplementary character is given to it as two units of its own class.
 */
import bidiFactory, { type BidiCharTypeName } from 'bidi-js';

import { unitsOf } from './graphemes';

const bidi = bidiFactory();

/** A character of each class, all in the Basic Multilingual Plane. */
const STAND_INS: Record<BidiCharTypeName, string> = {
  L: 'a',
  R: '\u05d0',
  AL: '\u0627',
  EN: '0',
  ES: '+',
  ET: '#',
  AN: '\u0660',
  CS: ',',
  NSM: '\u0300',
  BN: '\u200b',
  B: '\u2029',
  S: '\t',
  WS: ' ',
  ON: '!',
  LRE: '\u202a',
  RLE: '\u202b',
  PDF: '\u202c',
  LRO: '\u202d',
  RLO: '\u202e',
  LRI: '\u2066',
  RLI: '\u2067',
  FSI: '\u2068',
  PDI: '\u2069',
};

/** Classes that take the paragraph's level at the end of a line (rule L1). */
const TRAILING = new Set<BidiCharTypeName>([
  'WS',
  'S',
  'B',
  'BN',
  'LRE',
  'LRO',
  'RLE',
  'RLO',
  'PDF',
  'LRI',
  'RLI',
  'FSI',
  'PDI',
]);

const classOf = (codePoint: number): BidiCharTypeName =>
  bidi.getBidiCharTypeName(String.fromCodePoint(codePoint)) as BidiCharTypeName;

/** `text` with each supplementary character as two units of its class. */
function bmpText(text: string): string {
  let out = '';
  for (let at = 0; at < text.length; ) {
    const codePoint = text.codePointAt(at)!;
    if (codePoint > 0xffff) {
      const standIn = STAND_INS[classOf(codePoint)];
      out += standIn + standIn;
      at += 2;
    } else {
      out += text[at];
      at += 1;
    }
  }
  return out;
}

/**
 * Each code unit's level in a paragraph read left to right (level 0) or
 * right to left (level 1). Whitespace ending the paragraph is at its level,
 * as ICU gives it.
 */
export function paragraphLevels(text: string, rtl: boolean): number[] {
  const base = rtl ? 1 : 0;
  if (text.length === 0) return [];
  const levels = Array.from(bidi.getEmbeddingLevels(bmpText(text), rtl ? 'rtl' : 'ltr').levels);
  return trailingAtLevel(text, levels, 0, text.length, base);
}

/** The levels of the line `[begin, end)` of a paragraph at `base`: whitespace ending it at the paragraph's (L1). */
export function lineLevels(
  text: string,
  levels: readonly number[],
  begin: number,
  end: number,
  base: number,
): number[] {
  return trailingAtLevel(text, levels.slice(begin, end), begin, end, base);
}

function trailingAtLevel(
  text: string,
  levels: number[],
  begin: number,
  end: number,
  base: number,
): number[] {
  let at = end;
  while (at > begin) {
    const low = text.charCodeAt(at - 1);
    const start = low >= 0xdc00 && low <= 0xdfff && at - 2 >= begin ? at - 2 : at - 1;
    if (!TRAILING.has(classOf(text.codePointAt(start)!))) break;
    for (let unit = start; unit < at; unit += 1) levels[unit - begin] = base;
    at = start;
  }
  return levels;
}

/**
 * Whether `text` reads right to left by its first strong character, outside
 * isolates; `null` when it has none.
 */
export function firstStrongIsRtl(text: string): boolean | null {
  let isolates = 0;
  for (let at = 0; at < text.length; ) {
    const codePoint = text.codePointAt(at)!;
    switch (classOf(codePoint)) {
      case 'L':
        if (isolates === 0) return false;
        break;
      case 'R':
      case 'AL':
        if (isolates === 0) return true;
        break;
      case 'LRI':
      case 'RLI':
      case 'FSI':
        isolates += 1;
        break;
      case 'PDI':
        if (isolates > 0) isolates -= 1;
        break;
      default:
        break;
    }
    at += unitsOf(codePoint);
  }
  return null;
}

/**
 * The order runs at `levels` are drawn in, left to right, as indices into
 * `levels` (rule L2): from the highest level down to the lowest odd one,
 * every stretch at that level or above is reversed.
 */
export function visualOrder(levels: readonly number[]): number[] {
  const order = levels.map((_, index) => index);
  if (levels.length === 0) return order;
  const highest = Math.max(...levels);
  const lowestOdd = Math.min(...levels.map((level) => (level % 2 ? level : level + 1)));
  for (let level = highest; level >= lowestOdd; level -= 1) {
    for (let start = 0; start < order.length; ) {
      if (levels[order[start]!]! < level) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < order.length && levels[order[end]!]! >= level) end += 1;
      order.splice(start, end - start, ...order.slice(start, end).reverse());
      start = end;
    }
  }
  return order;
}

/** The character a right-to-left run draws for `codePoint`: its mirror, such as `)` for `(`. */
export function mirrorOf(codePoint: number): number {
  const mirrored = bidi.getMirroredCharacter(String.fromCodePoint(codePoint));
  return mirrored ? mirrored.codePointAt(0)! : codePoint;
}
