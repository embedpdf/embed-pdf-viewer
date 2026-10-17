/**
 * Text laid out as the engine lays out a widget's text: a port of PDFium's
 * variable text (`CPVT_VariableText`, `CPVT_Section`), the layout the
 * appearance generator draws every text field, combo box, list box row and
 * push button caption with.
 *
 * The text is split into sections at its line breaks (one line unless the
 * field is multi-line), each section into lines where the words would pass
 * the plate's width (`needsBreak`, CPVT's `NeedDivision`), and each line is
 * aligned in the plate. A font size of 0 is fitted: the biggest of CPVT's
 * sizes the text fits in. A comb field puts one character in the middle of
 * each of its cells instead.
 *
 * Positions are in the generator's space: PDF points, y up. A line's `y` is
 * its baseline. The arithmetic is single precision, like PDFium's, so a
 * width that only just fits breaks where the engine breaks it.
 */
import type { LayoutFont } from '../font';
import { needsBreak, isOpenPunctuation, isSpace } from './breaks';

const f32 = Math.fround;
const FONT_SCALE = f32(0.001);
/** The sizes a fitted font tries, smallest first; a multi-line field tries the first quarter. */
const FONT_SIZE_STEPS = [
  4, 6, 8, 9, 10, 12, 14, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130,
  144,
];

/** A rectangle in PDF space (y up). */
export interface PdfRect {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

export interface VariableTextOptions {
  /** The box the text is laid out in. */
  readonly plate: PdfRect;
  /** In points; 0 fits the text to the plate. */
  readonly fontSize: number;
  /** `/Q`: 0 left, 1 centred, 2 right. */
  readonly alignment: 0 | 1 | 2;
  /** Line breaks start new lines, and long lines wrap. */
  readonly multiline: boolean;
  /** Every character shows as this one (a password field's `*`). */
  readonly substitute?: string;
  /** At most this many characters, line breaks counted; 0 for no limit. */
  readonly limit: number;
  /** A comb: this many cells, one character in each; 0 for none. */
  readonly cells: number;
}

/** One character as laid out: its code unit, where its baseline starts, and its advance. */
export interface LaidWord {
  readonly code: number;
  readonly x: number;
  readonly y: number;
  /** In points, a comb's gap to the next cell included. */
  readonly width: number;
}

/** One line: where it starts, and its characters. */
export interface LaidLine {
  readonly x: number;
  readonly y: number;
  readonly words: readonly LaidWord[];
}

export interface TextLayout {
  readonly fontSize: number;
  readonly lines: readonly LaidLine[];
  /** The box the lines take, in the same space. */
  readonly content: PdfRect;
  /** A character the font can't write: the engine draws it in another font. */
  readonly approximate: boolean;
}

interface Word {
  code: number;
  /** A comb's gap to the next cell. */
  tail: number;
  x: number;
  y: number;
}

interface Line {
  begin: number;
  end: number;
  x: number;
  y: number;
  width: number;
  ascent: number;
  descent: number;
}

interface Section {
  words: Word[];
  lines: Line[];
  /** In layout space: y down from the plate's top. */
  rect: { left: number; top: number; right: number; bottom: number };
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const isFloatZero = (value: number) => value < 0.0001 && value > -0.0001;
const isFloatBigger = (left: number, right: number) =>
  left > right && !isFloatZero(f32(left - right));

export function layoutVariableText(
  text: string,
  font: LayoutFont,
  options: VariableTextOptions,
): TextLayout {
  const { plate, alignment, multiline, limit, cells } = options;
  const substitute = options.substitute ? options.substitute.charCodeAt(0) : 0;
  const plateWidth = f32(plate.right - plate.left);
  const plateHeight = f32(plate.top - plate.bottom);
  const fallbackWidth = font.width(0x6e) ?? 500;
  let approximate = false;

  const charWidth = (word: Word): number => {
    const code = substitute || word.code;
    const width = font.width(code);
    if (width === null) {
      approximate = true;
      return fallbackWidth;
    }
    return width;
  };
  const wordWidth = (word: Word, size: number): number =>
    f32(f32(f32(charWidth(word) * size) * FONT_SCALE) + word.tail);
  const fontAscent = (size: number) => f32(f32(font.ascent * size) * FONT_SCALE);
  const fontDescent = (size: number) => f32(f32(font.descent * size) * FONT_SCALE);

  // ── SetText ──
  const sections: Section[] = [newSection()];
  const totalWords = () => sections.reduce((sum, section) => sum + section.words.length + 1, 0) - 1;
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (limit > 0 && count >= limit) break;
    if (cells > 0 && count >= cells) break;
    let code = text.charCodeAt(index);
    if (code === 0x0d || code === 0x0a) {
      if (multiline) {
        const pair = code === 0x0d ? 0x0a : 0x0d;
        if (text.charCodeAt(index + 1) === pair) index += 1;
        sections.push(newSection());
      }
    } else {
      if (code === 0x09) code = 0x20;
      const full = (limit > 0 && totalWords() >= limit) || (cells > 0 && totalWords() >= cells);
      if (!full) sections[sections.length - 1]!.words.push({ code, tail: 0, x: 0, y: 0 });
    }
    count += 1;
  }

  // ── Rearrange ──
  let fontSize = options.fontSize;
  if (isFloatZero(fontSize)) fontSize = autoFontSize();
  let content: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  let positionY = 0;
  sections.forEach((section, index) => {
    const rect = cells > 0 ? arrangeCells(section) : arrangeTypeset(section);
    rect.top = f32(rect.top + positionY);
    rect.bottom = f32(rect.bottom + positionY);
    section.rect = rect;
    if (index === 0) content = { ...rect };
    else {
      content.left = Math.min(rect.left, content.left);
      content.top = Math.min(rect.top, content.top);
      content.right = Math.max(rect.right, content.right);
      content.bottom = Math.max(rect.bottom, content.bottom);
    }
    positionY = f32(positionY + f32(rect.bottom - rect.top));
  });

  // In layout space y runs down from the plate's top; out of it, PDF space.
  const outX = (x: number) => f32(x + plate.left);
  const outY = (y: number) => f32(plate.top - y);
  const lines: LaidLine[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      const words: LaidWord[] = [];
      for (let index = line.begin; index <= line.end && index >= 0; index += 1) {
        const word = section.words[index]!;
        words.push({
          code: substitute || word.code,
          x: outX(f32(word.x + section.rect.left)),
          y: outY(f32(word.y + section.rect.top)),
          width: wordWidth(word, fontSize),
        });
      }
      lines.push({
        x: outX(f32(line.x + section.rect.left)),
        y: outY(f32(line.y + section.rect.top)),
        words,
      });
    }
  }
  return {
    fontSize,
    lines,
    content: {
      left: outX(content.left),
      right: outX(content.right),
      top: outY(content.top),
      bottom: outY(content.bottom),
    },
    approximate,
  };

  // ── the pieces ──

  function newSection(): Section {
    return { words: [], lines: [], rect: { left: 0, top: 0, right: 0, bottom: 0 } };
  }

  /**
   * The biggest step the text fits in (`GetAutoFontSize`): the step before
   * the first one that's too big, searched as `std::lower_bound` searches.
   */
  function autoFontSize(): number {
    if (plateWidth <= 0) return 0;
    const steps = multiline
      ? FONT_SIZE_STEPS.slice(0, Math.trunc(FONT_SIZE_STEPS.length / 4))
      : FONT_SIZE_STEPS;
    let first = 0;
    let count = steps.length;
    while (count > 0) {
      const step = count >> 1;
      if (!isBigger(steps[first + step]!)) {
        first += step + 1;
        count -= step + 1;
      } else {
        count = step;
      }
    }
    if (first === steps.length) return steps[steps.length - 1]!;
    if (first === 0) return steps[0]!;
    return steps[first - 1]!;
  }

  function isBigger(size: number): boolean {
    let width = 0;
    let height = 0;
    for (const section of sections) {
      const rect = splitLines(section, false, size);
      width = Math.max(f32(rect.right - rect.left), width);
      height = f32(height + f32(rect.bottom - rect.top));
      if (isFloatBigger(width, plateWidth) || isFloatBigger(height, plateHeight)) return true;
    }
    return false;
  }

  /** CPVT's `SplitLines`: the lines a section breaks into; `typeset` keeps them. */
  function splitLines(section: Section, typeset: boolean, size: number): Rect {
    const words = section.words;
    const lineSize = typeset ? fontSize : size;
    if (words.length === 0) {
      const ascent = fontAscent(lineSize);
      const descent = fontDescent(lineSize);
      if (typeset) {
        section.lines.push({ begin: -1, end: -1, x: 0, y: 0, width: 0, ascent, descent });
      }
      return { left: 0, top: 0, right: 0, bottom: f32(ascent - descent) };
    }
    let lineHead = 0;
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
    let width = 0;
    let opened = false;
    const typesetWidth = Math.max(plateWidth, 0);
    const pushLine = (end: number) => {
      if (typeset) {
        section.lines.push({
          begin: lineHead,
          end,
          x: 0,
          y: 0,
          width: lineWidth,
          ascent: lineAscent,
          descent: lineDescent,
        });
      }
      maxY = f32(f32(maxY + lineAscent) - lineDescent);
      maxX = Math.max(lineWidth, maxX);
    };
    let index = 0;
    while (index < words.length) {
      const word = words[index]!;
      const previous = index > 0 ? words[index - 1]! : word;
      lineAscent = Math.max(lineAscent, fontAscent(lineSize));
      lineDescent = Math.min(lineDescent, fontDescent(lineSize));
      width = wordWidth(word, lineSize);
      if (!opened) {
        if (isOpenPunctuation(word.code)) {
          opened = true;
          fullWord = true;
        } else if (needsBreak(previous.code, word.code)) {
          fullWord = true;
        }
      } else if (!isSpace(word.code) && !isOpenPunctuation(word.code)) {
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
        pushLine(index - 1);
        lineHead = index;
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
    if (lineHead <= words.length - 1) pushLine(words.length - 1);
    return { left: 0, top: 0, right: maxX, bottom: maxY };
  }

  /** CPVT's `RearrangeTypeset` and `OutputLines`: the lines, aligned, each word placed. */
  function arrangeTypeset(section: Section): Rect {
    section.lines = [];
    const rect = splitLines(section, true, 0);
    const typesetWidth = Math.max(plateWidth, 0);
    const rectWidth = f32(rect.right - rect.left);
    const minX =
      alignment === 1
        ? f32(f32(typesetWidth - rectWidth) * 0.5)
        : alignment === 2
          ? f32(typesetWidth - rectWidth)
          : 0;
    let positionY = 0;
    for (const line of section.lines) {
      let positionX =
        alignment === 1
          ? f32(f32(typesetWidth - line.width) * 0.5)
          : alignment === 2
            ? f32(typesetWidth - line.width)
            : 0;
      positionY = f32(positionY + line.ascent);
      line.x = f32(positionX - minX);
      line.y = positionY;
      for (let index = line.begin; index <= line.end && index >= 0; index += 1) {
        const word = section.words[index]!;
        word.x = f32(positionX - minX);
        word.y = positionY;
        positionX = f32(positionX + wordWidth(word, fontSize));
      }
      positionY = f32(positionY - line.descent);
    }
    return {
      left: minX,
      top: 0,
      right: f32(minX + rectWidth),
      bottom: f32(rect.bottom - rect.top),
    };
  }

  /** CPVT's `RearrangeCharArray`: a comb, one character in the middle of each cell. */
  function arrangeCells(section: Section): Rect {
    const nodeWidth = f32(plateWidth / (cells <= 0 ? 1 : cells));
    let lineAscent = fontAscent(fontSize);
    let lineDescent = fontDescent(fontSize);
    const y = lineAscent;
    const words = section.words;
    let start = 0;
    let lineX = 0;
    switch (alignment) {
      case 0:
        lineX = f32(nodeWidth * 0.5);
        break;
      case 1:
        start = Math.trunc((cells - words.length) / 2);
        lineX = f32(f32(nodeWidth * start) - f32(nodeWidth * 0.5));
        break;
      case 2:
        start = cells - words.length;
        lineX = f32(f32(nodeWidth * start) - f32(nodeWidth * 0.5));
        break;
    }
    let x = 0;
    for (let index = 0; index < words.length && index < cells; index += 1) {
      let nextWidth = 0;
      const next = words[index + 1];
      if (next) {
        next.tail = 0;
        nextWidth = wordWidth(next, fontSize);
      }
      const word = words[index]!;
      word.tail = 0;
      const width = wordWidth(word, fontSize);
      x = f32(nodeWidth * (index + start + 0.5) - f32(width * 0.5));
      word.x = x;
      word.y = y;
      if (index === 0) lineX = x;
      const gap = f32(nodeWidth - f32(f32(width + nextWidth) * 0.5));
      word.tail = index !== words.length - 1 && gap > 0 ? gap : 0;
      x = f32(x + width);
      lineAscent = Math.max(lineAscent, fontAscent(fontSize));
      lineDescent = Math.min(lineDescent, fontDescent(fontSize));
    }
    section.lines = [
      {
        begin: 0,
        end: words.length - 1,
        x: lineX,
        y,
        width: f32(x - lineX),
        ascent: lineAscent,
        descent: lineDescent,
      },
    ];
    return { left: 0, top: 0, right: x, bottom: f32(y - lineDescent) };
  }
}
