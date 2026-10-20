/**
 * A paragraph cut into items as the engine cuts it (`Itemize`): stretches of
 * one font, one bidi level and one script, each measured as the engine
 * shapes it.
 */
import { lineLevels, paragraphLevels, visualOrder } from './bidi';
import { matchGrapheme, type TextFont, type TextFonts } from './fonts';
import { codePointsOf, graphemesOf, isInvisibleGrapheme } from './graphemes';
import { isCommonScript, isSimpleScript, scriptOf } from './scripts';

export interface Item<F extends TextFont = TextFont> {
  /** Code units of the paragraph's text. */
  readonly begin: number;
  readonly end: number;
  readonly font: F;
  readonly level: number;
  readonly script: string;
}

/** A grapheme of an itemized paragraph, with the widths of the glyphs it draws. */
export interface Grapheme {
  readonly begin: number;
  readonly end: number;
  /** Its item's index. */
  readonly item: number;
  /** In thousandths of the font size, one per glyph as the engine adds them up. */
  readonly widths: readonly number[];
}

export interface Paragraph<F extends TextFont = TextFont> {
  readonly text: string;
  /** 0 for a paragraph read left to right, 1 right to left. */
  readonly base: number;
  /** Per code unit. */
  readonly levels: readonly number[];
  readonly items: readonly Item<F>[];
  readonly graphemes: readonly Grapheme[];
  /** Graphemes no font has, first seen first. */
  readonly missing: readonly string[];
}

const SPACE = /^\s+$/u;

/** The items of `text` as a paragraph read right to left when `rtl`, in `fonts`. */
export function itemize<F extends TextFont>(
  text: string,
  rtl: boolean,
  fonts: TextFonts<F>,
): Paragraph<F> {
  const levels = paragraphLevels(text, rtl);
  const cuts = graphemesOf(text);
  const missing: string[] = [];

  // Per grapheme: script, level, font. Characters of no script of their own
  // follow the one before them; leading ones, the one after.
  const pieces: { begin: number; end: number; script: string; level: number; font: F }[] = [];
  let lastScript = 'Common';
  for (const [begin, end] of cuts) {
    const grapheme = text.slice(begin, end);
    let script = scriptOf(text.codePointAt(begin)!);
    if (isCommonScript(script)) script = lastScript;
    else lastScript = script;
    const match = matchGrapheme(grapheme, fonts);
    if (!match.covered && !isInvisibleGrapheme(grapheme) && !missing.includes(grapheme)) {
      missing.push(grapheme);
    }
    pieces.push({ begin, end, script, level: levels[begin]!, font: match.font });
  }
  for (let index = pieces.length; index > 1; index -= 1) {
    if (isCommonScript(pieces[index - 2]!.script)) {
      pieces[index - 2]!.script = pieces[index - 1]!.script;
    }
  }

  const items: Item<F>[] = [];
  for (const piece of pieces) {
    const last = items[items.length - 1];
    if (
      last &&
      last.font === piece.font &&
      last.level === piece.level &&
      (last.script === piece.script || isCommonScript(piece.script))
    ) {
      items[items.length - 1] = { ...last, end: piece.end };
      continue;
    }
    items.push({ ...piece });
  }

  const graphemes: Grapheme[] = [];
  items.forEach((item, index) => {
    const inItem = cuts.filter(([begin]) => begin >= item.begin && begin < item.end);
    const widths = widthsOf(text, item, inItem);
    inItem.forEach(([begin, end], at) =>
      graphemes.push({ begin, end, item: index, widths: widths[at]! }),
    );
  });
  return { text, base: rtl ? 1 : 0, levels, items, graphemes, missing };
}

/**
 * Each grapheme's glyph widths in `item`. A standard font draws a glyph per
 * character from its advances. A simple script is drawn with kerning and
 * ligatures off, so each grapheme is as wide as its own glyph, which the
 * engine rounds to the thousandths its PDF widths hold. Any other script is
 * shaped: each word is measured whole (shaping starts again after a space, so
 * a line ending at a word ends where the engine's does), each space alone, and
 * a word's graphemes take what each adds to its prefixes. Inside a word that
 * is approximate: a joined letter's width depends on the letter after it.
 */
function widthsOf(text: string, item: Item<TextFont>, cuts: [number, number][]): number[][] {
  const rtl = item.level % 2 === 1;
  const { font } = item;
  if (font.standard) {
    return cuts.map(([begin, end]) =>
      codePointsOf(text.slice(begin, end)).map((codePoint) =>
        font.width(String.fromCodePoint(codePoint), rtl),
      ),
    );
  }
  if (isSimpleScript(item.script)) {
    return cuts.map(([begin, end]) => [Math.round(font.width(text.slice(begin, end), rtl))]);
  }
  const widths: number[][] = [];
  const isSpaceAt = (at: number) => SPACE.test(text.slice(cuts[at]![0], cuts[at]![1]));
  for (let at = 0; at < cuts.length; ) {
    if (isSpaceAt(at)) {
      widths.push([font.width(text.slice(cuts[at]![0], cuts[at]![1]), rtl)]);
      at += 1;
      continue;
    }
    let end = at + 1;
    while (end < cuts.length && !isSpaceAt(end)) end += 1;
    const wordBegin = cuts[at]![0];
    let before = 0;
    for (let grapheme = at; grapheme < end; grapheme += 1) {
      const prefix = font.width(text.slice(wordBegin, cuts[grapheme]![1]), rtl);
      widths.push([prefix - before]);
      before = prefix;
    }
    at = end;
  }
  return widths;
}

const f32 = Math.fround;
const THOUSANDTH = f32(0.001);

/** A glyph's width at `size` points, in the engine's single precision. */
export const scaled = (thousandths: number, size: number): number =>
  f32(f32(thousandths * size) * THOUSANDTH);

/** How wide the graphemes `[from, to)` of `paragraph` are at `size` points. */
export function graphemesWidth(
  paragraph: Paragraph<TextFont>,
  from: number,
  to: number,
  size: number,
): number {
  let width = 0;
  for (let index = from; index < to; index += 1) {
    for (const glyph of paragraph.graphemes[index]!.widths)
      width = f32(width + scaled(glyph, size));
  }
  return width;
}

/** A run of a line: one item's characters at one level. */
export interface Run<F extends TextFont = TextFont> {
  readonly font: F;
  /** Its characters, in the order typed. */
  readonly text: string;
  /** Drawn right to left. */
  readonly rtl: boolean;
  /** A simple script, or a standard font: drawn with kerning and ligatures off, as the engine draws it. */
  readonly plain: boolean;
  /** In points. */
  readonly width: number;
  /** Code units of the paragraph's text. */
  readonly begin: number;
  readonly end: number;
}

/**
 * The runs of the line of graphemes `[from, to)`, in the order they are drawn,
 * left to right (`RunsFor`): each item's part of the line, cut where the
 * line's levels change, ordered by rule L2.
 */
export function runsOf<F extends TextFont>(
  paragraph: Paragraph<F>,
  from: number,
  to: number,
  size: number,
): Run<F>[] {
  if (from >= to) return [];
  const { text, graphemes, items } = paragraph;
  const begin = graphemes[from]!.begin;
  const end = graphemes[to - 1]!.end;
  const levels = lineLevels(text, paragraph.levels, begin, end, paragraph.base);
  const runs: Run<F>[] = [];
  const runLevels: number[] = [];
  let index = from;
  while (index < to) {
    const grapheme = graphemes[index]!;
    const level = levels[grapheme.begin - begin]!;
    let next = index + 1;
    while (
      next < to &&
      graphemes[next]!.item === grapheme.item &&
      levels[graphemes[next]!.begin - begin] === level
    ) {
      next += 1;
    }
    const item = items[grapheme.item]!;
    const runEnd = graphemes[next - 1]!.end;
    runs.push({
      font: item.font,
      text: text.slice(grapheme.begin, runEnd),
      rtl: item.level % 2 === 1,
      plain: item.font.standard || isSimpleScript(item.script),
      width: graphemesWidth(paragraph, index, next, size),
      begin: grapheme.begin,
      end: runEnd,
    });
    runLevels.push(level);
    index = next;
  }
  return visualOrder(runLevels).map((at) => runs[at]!);
}
