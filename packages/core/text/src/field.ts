/**
 * A form field's text laid out as the engine lays it out
 * (`CPDF_RichTextLayout::ArrangeField`): the geometry of PDFium's form
 * filler (`CPVT`) over the shared text engine's characters. The text splits
 * into sections at its line breaks (one unless the field is multi-line),
 * each section into lines where CPVT breaks them, and each line into runs in
 * the order they are drawn. A font size of 0 is fitted: the biggest of CPVT's
 * sizes the text fits in. A comb puts one character in the middle of each
 * cell, a letter of a cursive script in the form the whole text gives it
 * (joined to the letters around it). A field reads right to left when its
 * first strong character does.
 *
 * Positions are PDF points, y up, as the field's appearance stream has them.
 * The arithmetic is single precision, as the engine's, so a line breaks where
 * the engine breaks it.
 */
import type { PdfRect } from '@embedpdf/engine-core/runtime';

import { firstStrongIsRtl } from './bidi';
import { isOpenPunctuation, isSpace, needsBreak } from './breaks';
import type { TextFont, TextFonts } from './fonts';
import { graphemeStarts } from './graphemes';
import { graphemesWidth, itemize, runsOf, scaled, type Paragraph, type Run } from './items';
import { joinedText, joinsOf, type Joins } from './joining';

const f32 = Math.fround;
const isFloatZero = (value: number) => value < 0.0001 && value > -0.0001;
const isFloatBigger = (left: number, right: number) =>
  left > right && !isFloatZero(f32(left - right));

/** The sizes a fitted font tries, smallest first; a multi-line field tries the first quarter. */
const FONT_SIZE_STEPS = [
  4, 6, 8, 9, 10, 12, 14, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130,
  144,
];

export interface FieldTextOptions {
  /** The box the text is laid out in. */
  readonly plate: PdfRect;
  /** In points; 0 fits the text to the plate. */
  readonly fontSize: number;
  /** `/Q`: 0 left, 1 centred, 2 right. */
  readonly alignment: 0 | 1 | 2;
  /** Line breaks start new lines, and long lines wrap. */
  readonly multiline: boolean;
  /** Every character shows as `*`. */
  readonly password: boolean;
  /** At most this many code units, line breaks counted; 0 for no limit. */
  readonly limit: number;
  /** A comb: this many cells, one character in each; 0 for none. */
  readonly cells: number;
  /** The lines' middle at the plate's middle: a one-line field, a combo box, a caption. */
  readonly centered: boolean;
}

/** Text one font draws, in one direction. */
export interface FieldRun<F extends TextFont = TextFont> {
  readonly font: F;
  /** Its characters, in the order typed. */
  readonly text: string;
  /** Drawn right to left: its first character on the right. */
  readonly rtl: boolean;
  /** A simple script, or a standard font: drawn with kerning and ligatures off, as the engine draws it. */
  readonly plain: boolean;
  /** Where its left edge is. */
  readonly x: number;
  /** In points. */
  readonly width: number;
  /**
   * A comb cell's letter, joined to the letter in the cell before it (in
   * typing order), as the engine shapes the whole text: drawn alone, it takes
   * that joined form only with a joiner (U+200D) on that side.
   */
  readonly joinsPrevious: boolean;
  /** The same, to the letter in the cell after it. */
  readonly joinsNext: boolean;
}

export interface FieldLine<F extends TextFont = TextFont> {
  /** The baseline's y. */
  readonly baseline: number;
  /** In the order drawn, left to right. */
  readonly runs: readonly FieldRun<F>[];
}

export interface FieldText<F extends TextFont = TextFont> {
  /** The size it is drawn at: the field's, or the fitted one. */
  readonly fontSize: number;
  /** The height its lines take. */
  readonly contentHeight: number;
  readonly lines: readonly FieldLine<F>[];
  /**
   * The direction its lines read in: right to left when its first strong
   * character is (Hebrew, Arabic), left to right otherwise.
   */
  readonly rtl: boolean;
  /** Characters no font has, drawn as boxes: each a grapheme, first seen first. */
  readonly missing: readonly string[];
}

/** A grapheme of a section, as CPVT's word breaking and line metrics see it. */
interface Unit {
  /** Its grapheme's index in its paragraph. */
  readonly grapheme: number;
  /** Its first code unit, as CPVT's breaking reads it. */
  readonly code: number;
  /** In thousandths of the font size. */
  readonly ascent: number;
  readonly descent: number;
}

interface Line {
  /** Units; -1 for an empty section's one line. */
  readonly begin: number;
  readonly end: number;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

interface Section<F extends TextFont> {
  readonly paragraph: Paragraph<F>;
  readonly units: readonly Unit[];
}

export function layoutField<F extends TextFont>(
  text: string,
  fonts: TextFonts<F>,
  options: FieldTextOptions,
): FieldText<F> {
  const { plate, alignment, multiline, cells } = options;
  const plateWidth = f32(plate.right - plate.left);
  const plateHeight = f32(plate.top - plate.bottom);
  const typesetWidth = Math.max(plateWidth, 0);
  const texts = sectionsOf(text, options);
  const rtl = firstStrongIsRtl(texts.join('')) ?? false;
  const comb = cells > 0;
  const sections: Section<F>[] = texts.map((sectionText) => {
    const paragraph = itemize(sectionText, rtl, fonts);
    const units = paragraph.graphemes.map((grapheme, index): Unit => {
      const { font } = paragraph.items[grapheme.item]!;
      return {
        grapheme: index,
        code: sectionText.charCodeAt(grapheme.begin),
        ascent: font.ascent,
        descent: font.descent,
      };
    });
    return { paragraph, units };
  });
  const missing = [...new Set(sections.flatMap((section) => section.paragraph.missing))];

  const unitWidth = (section: Section<F>, unit: Unit, size: number) =>
    graphemesWidth(section.paragraph, unit.grapheme, unit.grapheme + 1, size);
  /** Where each of a comb's characters joins the ones in the cells around it: shaped as one text. */
  const cellJoins = ({ paragraph, units }: Section<F>): Joins[] => {
    const graphemeOf = (unit: Unit) => paragraph.graphemes[unit.grapheme]!;
    return joinsOf(
      units.map((unit) => paragraph.text.slice(graphemeOf(unit).begin, graphemeOf(unit).end)),
      (a, b) => graphemeOf(units[a]!).item === graphemeOf(units[b]!).item,
    );
  };
  /** A comb character's width: its joined form's, where it joins a neighbour. */
  const cellWidth = (section: Section<F>, unit: Unit, joins: Joins, size: number) => {
    if (!joins.previous && !joins.next) return unitWidth(section, unit, size);
    const { paragraph } = section;
    const grapheme = paragraph.graphemes[unit.grapheme]!;
    const item = paragraph.items[grapheme.item]!;
    const text = joinedText(paragraph.text.slice(grapheme.begin, grapheme.end), joins);
    return scaled(item.font.width(text, item.level % 2 === 1), size);
  };
  const faceAscent = (size: number) => scaled(fonts.face.ascent, size);
  const faceDescent = (size: number) => scaled(fonts.face.descent, size);

  // ── The size ──
  let fontSize = options.fontSize;
  if (isFloatZero(fontSize)) {
    fontSize = 0;
    if (plateWidth > 0) {
      const steps = multiline
        ? FONT_SIZE_STEPS.slice(0, Math.trunc(FONT_SIZE_STEPS.length / 4))
        : FONT_SIZE_STEPS;
      const tooBig = (size: number) => {
        let width = 0;
        let height = 0;
        for (const section of sections) {
          const extent = splitLines(section, size, null);
          width = Math.max(extent.width, width);
          height = f32(height + extent.height);
          if (isFloatBigger(width, plateWidth) || isFloatBigger(height, plateHeight)) return true;
        }
        return false;
      };
      let first = 0;
      let count = steps.length;
      while (count > 0) {
        const step = count >> 1;
        if (!tooBig(steps[first + step]!)) {
          first += step + 1;
          count -= step + 1;
        } else {
          count = step;
        }
      }
      fontSize =
        first === steps.length ? steps[steps.length - 1]! : steps[first === 0 ? 0 : first - 1]!;
    }
  }

  // ── Each section's lines, placed as CPVT places them, one section under the other ──
  const placed: {
    section: Section<F>;
    lines: Line[];
    cellX: number[];
    cellJoins: Joins[];
    left: number;
    top: number;
  }[] = [];
  let positionY = 0;
  let contentHeight = 0;
  for (const section of sections) {
    let lines: Line[];
    const cellX: number[] = [];
    let joins: Joins[] = [];
    let left = 0;
    let height: number;
    if (comb) {
      const nodeWidth = f32(plateWidth / cells);
      const units = section.units.length;
      let start = 0;
      if (alignment === 1) start = Math.trunc((cells - units) / 2);
      else if (alignment === 2) start = cells - units;
      const ascent = faceAscent(fontSize);
      let lineDescent = faceDescent(fontSize);
      joins = cellJoins(section);
      for (let index = 0; index < units && index < cells; index += 1) {
        const unit = section.units[index]!;
        const width = cellWidth(section, unit, joins[index]!, fontSize);
        cellX.push(f32(nodeWidth * (index + start + 0.5) - f32(width * 0.5)));
        lineDescent = Math.min(lineDescent, scaled(unit.descent, fontSize));
      }
      lines = [
        { begin: units > 0 ? 0 : -1, end: units - 1, width: 0, ascent, descent: lineDescent },
      ];
      height = f32(ascent - lineDescent);
    } else {
      lines = [];
      const extent = splitLines(section, fontSize, lines);
      left = alignmentOffset(alignment, typesetWidth, extent.width);
      height = extent.height;
    }
    placed.push({ section, lines, cellX, cellJoins: joins, left, top: positionY });
    positionY = f32(positionY + height);
    contentHeight = f32(contentHeight + height);
  }

  // A one-line field's text has its middle at the plate's middle.
  const offsetY = options.centered ? f32(f32(contentHeight - plateHeight) / 2) : 0;

  const out: FieldLine<F>[] = [];
  for (const { section, lines, cellX, cellJoins: joins, left, top } of placed) {
    let lineTop = 0;
    for (const line of lines) {
      lineTop = f32(lineTop + line.ascent);
      const baselineY = f32(f32(lineTop + top) - offsetY);
      lineTop = f32(lineTop - line.descent);
      const runs: FieldRun<F>[] = [];
      if (line.begin >= 0) {
        if (comb) {
          cellX.forEach((x, index) => {
            const unit = section.units[index]!;
            const cell = joins[index]!;
            for (const run of runsOf(
              section.paragraph,
              unit.grapheme,
              unit.grapheme + 1,
              fontSize,
            )) {
              runs.push({
                ...fieldRun(run, x),
                width: cellWidth(section, unit, cell, fontSize),
                joinsPrevious: cell.previous,
                joinsNext: cell.next,
              });
            }
          });
        } else {
          let x = alignmentOffset(alignment, typesetWidth, line.width);
          const from = section.units[line.begin]!.grapheme;
          const to = section.units[line.end]!.grapheme + 1;
          for (const run of runsOf(section.paragraph, from, to, fontSize)) {
            runs.push(fieldRun(run, f32(f32(x - left) + left)));
            x = f32(x + run.width);
          }
        }
      }
      out.push({ baseline: f32(plate.top - baselineY), runs });
    }
  }
  return { fontSize, contentHeight, lines: out, rtl, missing };

  function fieldRun(run: Run<F>, x: number): FieldRun<F> {
    const { font, text, rtl, plain, width } = run;
    return {
      font,
      text,
      rtl,
      plain,
      x: f32(plate.left + x),
      width,
      joinsPrevious: false,
      joinsNext: false,
    };
  }

  /**
   * CPVT's `SplitLines` over a section's units at `size`: the lines they break
   * into in a multi-line field (before the word that would pass the plate's
   * width, or before the unit when one word is wider), and the box they take.
   * `lines` receives them; `null` only measures.
   */
  function splitLines(
    section: Section<F>,
    size: number,
    lines: Line[] | null,
  ): { width: number; height: number } {
    const { units } = section;
    if (units.length === 0) {
      const ascent = faceAscent(size);
      const descent = faceDescent(size);
      lines?.push({ begin: -1, end: -1, width: 0, ascent, descent });
      return { width: 0, height: f32(ascent - descent) };
    }
    let head = 0;
    let maxX = 0;
    let maxY = 0;
    let lineWidth = 0;
    let backupWidth = 0;
    let lineAscent = 0;
    let backupAscent = 0;
    let lineDescent = 0;
    let backupDescent = 0;
    let wordStart = 0;
    let fullWord = false;
    let fullWords = 0;
    let charIndex = 0;
    let opened = false;
    const addLine = (tail: number) => {
      lines?.push({
        begin: head,
        end: tail,
        width: lineWidth,
        ascent: lineAscent,
        descent: lineDescent,
      });
      maxY = f32(maxY + lineAscent);
      maxY = f32(maxY - lineDescent);
      maxX = Math.max(lineWidth, maxX);
    };
    let index = 0;
    while (index < units.length) {
      const unit = units[index]!;
      const previous = units[index > 0 ? index - 1 : index]!;
      lineAscent = Math.max(lineAscent, scaled(unit.ascent, size));
      lineDescent = Math.min(lineDescent, scaled(unit.descent, size));
      if (!opened) {
        if (isOpenPunctuation(unit.code)) {
          opened = true;
          fullWord = true;
        } else if (needsBreak(previous.code, unit.code)) {
          fullWord = true;
        }
      } else if (!isSpace(unit.code) && !isOpenPunctuation(unit.code)) {
        opened = false;
      }
      if (fullWord) {
        fullWord = false;
        if (charIndex > 0) fullWords += 1;
        wordStart = index;
        backupWidth = lineWidth;
        backupAscent = lineAscent;
        backupDescent = lineDescent;
      }
      charIndex += 1;
      const width = unitWidth(section, unit, size);
      if (multiline && typesetWidth > 0 && f32(lineWidth + width) > typesetWidth) {
        if (fullWords > 0) {
          index = wordStart;
          lineWidth = backupWidth;
          lineAscent = backupAscent;
          lineDescent = backupDescent;
        }
        if (charIndex === 1) {
          lineWidth = width;
          index += 1;
        }
        addLine(index - 1);
        head = index;
        lineWidth = 0;
        lineAscent = 0;
        lineDescent = 0;
        charIndex = 0;
        fullWords = 0;
        fullWord = false;
      } else {
        lineWidth = f32(lineWidth + width);
        index += 1;
      }
    }
    if (head <= units.length - 1) addLine(units.length - 1);
    return { width: maxX, height: maxY };
  }
}

/** Where a line `width` wide starts in `typesetWidth`, by `/Q`. */
function alignmentOffset(alignment: 0 | 1 | 2, typesetWidth: number, width: number): number {
  if (alignment === 1) return f32(f32(typesetWidth - width) * 0.5);
  if (alignment === 2) return f32(typesetWidth - width);
  return 0;
}

/**
 * The text's sections as CPVT takes it (`FieldSectionsOf`): line breaks (CR,
 * LF or both) start a section in a multi-line field and are dropped in any
 * other, a tab is a space, and the limit or the comb's cells stop it.
 * Graphemes stay whole; a password's are `*`.
 */
function sectionsOf(text: string, options: FieldTextOptions): string[] {
  const { limit, cells, multiline, password } = options;
  const starts = graphemeStarts(text);
  const sections = [''];
  // What CPVT counts: the text taken, line breaks included, and what it kept,
  // a break between sections included; the limit in code units, the cells in
  // characters.
  let takenUnits = 0;
  let takenCharacters = 0;
  let keptUnits = 0;
  let keptCharacters = 0;
  for (let begin = 0; begin < text.length; ) {
    let end = begin + 1;
    while (end < text.length && !starts[end]) end += 1;
    const units = end - begin;
    if (limit > 0 && takenUnits + units > limit) break;
    if (cells > 0 && takenCharacters >= cells) break;
    const first = text[begin];
    if (first === '\r' || first === '\n') {
      if (multiline) {
        // CR LF is one break.
        const pair = first === '\r' ? '\n' : '\r';
        if (text[end] === pair) end += 1;
        sections.push('');
        keptUnits += 1;
        keptCharacters += 1;
      }
    } else {
      const full =
        (limit > 0 && keptUnits + units > limit) || (cells > 0 && keptCharacters >= cells);
      if (!full) {
        sections[sections.length - 1] += password
          ? '*'
          : first === '\t'
            ? ' '
            : text.slice(begin, end);
        keptUnits += units;
        keptCharacters += 1;
      }
    }
    takenUnits += units;
    takenCharacters += 1;
    begin = end;
  }
  return sections;
}
