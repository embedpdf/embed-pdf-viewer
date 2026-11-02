import { describe, expect, test } from 'vitest';

import {
  firstStrongIsRtl,
  graphemesOf,
  joiningTypeOf,
  joinsOf,
  layoutField,
  matchGrapheme,
  paragraphLevels,
  programPaintFont,
  scriptOf,
  standardTextFont,
  visualOrder,
  type FieldText,
  type TextFont,
  type TextFonts,
} from '../src';

/** A font with every character 500 thousandths wide, covering the code points `ranges` hold. */
function fakeFont(key: string, ranges: [number, number][], ascent = 900, descent = -300): TextFont {
  return {
    key,
    ascent,
    descent,
    standard: false,
    covers: (codePoint) => ranges.some(([from, to]) => codePoint >= from && codePoint <= to),
    // Marks and joiners take no room.
    width: (text) => [...text].filter((c) => !/[\p{M}\u200d]/u.test(c)).length * 500,
  };
}

const HELVETICA = standardTextFont('helvetica');
const HEBREW = fakeFont('hebrew', [[0x0590, 0x05ff]]);
const LAST_RESORT = fakeFont('last-resort', [[0, 0x10ffff]], 800, -200);
const FONTS: TextFonts = { face: HELVETICA, fallbacks: [HEBREW], lastResort: LAST_RESORT };

const PLATE = { left: 2, bottom: 1, right: 298, top: 23 };
const FIELD = {
  plate: PLATE,
  fontSize: 12,
  alignment: 0 as const,
  multiline: false,
  password: false,
  limit: 0,
  cells: 0,
  centered: true,
};

/** Each line's runs as `[font, text, rtl]`, left to right. */
const runsOf = (laid: FieldText) =>
  laid.lines.map((line) => line.runs.map((run) => [run.font.key, run.text, run.rtl]));

describe('graphemes', () => {
  test('a letter keeps its marks; a surrogate pair and a joined sequence stay whole', () => {
    const pointed = 'ש\u05b8\u05c1לו\u05b9ם';
    expect(graphemesOf(pointed).map(([b, e]) => pointed.slice(b, e))).toEqual([
      'ש\u05b8\u05c1',
      'ל',
      'ו\u05b9',
      'ם',
    ]);
    const family = 'a👩\u200d👧b';
    expect(graphemesOf(family).map(([b, e]) => family.slice(b, e))).toEqual([
      'a',
      '👩\u200d👧',
      'b',
    ]);
  });
});

describe('scripts', () => {
  test('letters have their script; spaces and digits are Common, generic marks Inherited', () => {
    expect(scriptOf(0x5d0)).toBe('Hebrew');
    expect(scriptOf(0x627)).toBe('Arabic');
    expect(scriptOf(0x41)).toBe('Latin');
    expect(scriptOf(0x20)).toBe('Common');
    expect(scriptOf(0x31)).toBe('Common');
    expect(scriptOf(0x5b8)).toBe('Hebrew');
    expect(scriptOf(0x300)).toBe('Inherited');
    expect(scriptOf(0x4e2d)).toBe('Han');
  });
});

describe('bidi', () => {
  test('digits after Hebrew read with it; a field reads in its first strong direction', () => {
    expect(paragraphLevels('Hello שלום 123', false)).toEqual([
      0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2,
    ]);
    expect(firstStrongIsRtl('123 שלום')).toBe(true);
    expect(firstStrongIsRtl('Hello שלום')).toBe(false);
    expect(firstStrongIsRtl('123 ...')).toBeNull();
  });

  test('runs are reversed from the highest level down to the lowest odd one', () => {
    expect(visualOrder([0, 1, 1, 2])).toEqual([0, 3, 2, 1]);
    expect(visualOrder([1, 2, 1])).toEqual([2, 1, 0]);
    expect(visualOrder([2, 2])).toEqual([0, 1]);
  });

  test('a supplementary character takes its own class', () => {
    // Adlam is right to left; an emoji is neutral, so between Hebrew letters
    // it reads with them.
    expect(firstStrongIsRtl('\u{1E900}a')).toBe(true);
    expect(paragraphLevels('א 😀 ב', false)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('the font per grapheme', () => {
  test('the face, then the first fallback that has it all, then the last resort', () => {
    expect(matchGrapheme('A', FONTS)).toEqual({ font: HELVETICA, covered: true });
    expect(matchGrapheme('ש\u05b8', FONTS)).toEqual({ font: HEBREW, covered: true });
    expect(matchGrapheme('中', FONTS)).toEqual({ font: LAST_RESORT, covered: false });
    // A grapheme that draws nothing stays with the face.
    expect(matchGrapheme('\u200b', FONTS)).toEqual({ font: HELVETICA, covered: false });
  });

  test('a standard font covers what its encoding writes', () => {
    expect(HELVETICA.covers(0x20ac)).toBe(true);
    expect(HELVETICA.covers(0x5d0)).toBe(false);
    expect(HELVETICA.width('Hi', false)).toBe(722 + 222);
  });

  test("a program covers the engine's ranges, has its metrics and measures as it is told", () => {
    const program = {
      hash: 'a'.repeat(64),
      family: 'epdf-aaaaaaaaaaaaaaaa',
      weight: 700,
      style: 'italic' as const,
      load: async () => new Uint8Array(),
    };
    const measured: [string, boolean][] = [];
    const font = programPaintFont(
      {
        displayHash: program.hash,
        sourceHash: program.hash,
        embedded: 'whole',
        format: 'truetype',
        embeddingPermission: 'installable',
        canDownload: true,
        // Out of order: the engine's ranges are read as they come.
        covers: [
          { start: 0x05d0, count: 27 },
          { start: 0x20, count: 95 },
        ],
        ascent: 950,
        descent: -250,
      },
      program,
      (text, rtl) => {
        measured.push([text, rtl]);
        return 600;
      },
    );
    expect([0x1f, 0x20, 0x7e, 0x7f, 0x5cf, 0x5d0, 0x5ea, 0x5eb].map(font.covers)).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(font).toMatchObject({
      key: program.hash,
      ascent: 950,
      descent: -250,
      standard: false,
      fontFamily: '"epdf-aaaaaaaaaaaaaaaa"',
      fontWeight: 700,
      fontStyle: 'italic',
      program,
    });
    expect(font.width('שלום', true)).toBe(600);
    expect(measured).toEqual([['שלום', true]]);
  });
});

describe('a field', () => {
  test('Latin, Hebrew and digits: the digits read with the Hebrew, drawn before it', () => {
    const laid = layoutField('Hello שלום 123', FONTS, FIELD);
    expect(runsOf(laid)).toEqual([
      [
        ['helvetica', 'Hello ', false],
        ['helvetica', '123', false],
        ['helvetica', ' ', true],
        ['hebrew', 'שלום', true],
      ],
    ]);
    const [line] = laid.lines;
    // Each run starts where the one before ends, from the plate's left.
    let x = PLATE.left;
    for (const run of line!.runs) {
      expect(run.x).toBeCloseTo(x, 4);
      x += run.width;
    }
    expect(laid.missing).toEqual([]);
  });

  test('a field whose first strong character is Hebrew reads right to left', () => {
    const laid = layoutField('123 שלום', FONTS, FIELD);
    expect(runsOf(laid)).toEqual([
      [
        ['hebrew', 'שלום', true],
        ['helvetica', ' ', true],
        ['helvetica', '123', false],
      ],
    ]);
    // What an editor reads the line in, so it orders the line as the engine does.
    expect(laid.rtl).toBe(true);
    expect(layoutField('Hello שלום', FONTS, FIELD).rtl).toBe(false);
    expect(layoutField('שלום test 123', FONTS, FIELD).rtl).toBe(true);
    // Nothing that reads either way: left to right.
    expect(layoutField('123', FONTS, FIELD).rtl).toBe(false);
    expect(layoutField('', FONTS, FIELD).rtl).toBe(false);
  });

  test('a character no font has is drawn by the last resort, and reported', () => {
    const laid = layoutField('A中B', FONTS, FIELD);
    expect(runsOf(laid)).toEqual([
      [
        ['helvetica', 'A', false],
        ['last-resort', '中', false],
        ['helvetica', 'B', false],
      ],
    ]);
    expect(laid.missing).toEqual(['中']);
  });

  test("right alignment ends the line at the plate's right; centring puts its middle at the middle", () => {
    const right = layoutField('Hi', FONTS, { ...FIELD, alignment: 2 }).lines[0]!.runs[0]!;
    expect(right.x + right.width).toBeCloseTo(PLATE.right, 3);
    const laid = layoutField('Hi', FONTS, FIELD);
    const middle = (PLATE.top + PLATE.bottom) / 2;
    const ascent = (HELVETICA.ascent * 12) / 1000;
    const descent = (HELVETICA.descent * 12) / 1000;
    expect(laid.lines[0]!.baseline).toBeCloseTo(middle - (ascent + descent) / 2, 3);
  });

  test('a multi-line field breaks at its line breaks and wraps; a fitted size fits', () => {
    const laid = layoutField('one two three four five six seven\nשלום', FONTS, {
      ...FIELD,
      plate: { left: 2, bottom: 1, right: 100, top: 99 },
      multiline: true,
      centered: false,
    });
    expect(laid.lines.map((line) => line.runs.map((run) => run.text).join(''))).toEqual([
      'one two three ',
      'four five six seven',
      'שלום',
    ]);
    const fitted = layoutField('A long value that has to shrink', FONTS, { ...FIELD, fontSize: 0 });
    expect(fitted.fontSize).toBe(18);
  });

  test('a simple script in a program font is as wide as its glyphs, each rounded as the PDF holds it', () => {
    const latin: TextFont = {
      ...fakeFont('latin', [[0x20, 0x7e]]),
      width: (text) => text.length * 500.4,
    };
    const laid = layoutField('abcd', { face: latin, fallbacks: [], lastResort: null }, FIELD);
    // Four glyphs of 500 thousandths at 12 pt, not 4 x 500.4.
    expect(laid.lines[0]!.runs[0]!.width).toBeCloseTo(24, 4);
  });

  test('a comb puts one character in each cell, a password shows stars', () => {
    const comb = layoutField('אב', FONTS, { ...FIELD, cells: 4, centered: true });
    expect(comb.lines[0]!.runs.map((run) => run.text)).toEqual(['א', 'ב']);
    const cell = (PLATE.right - PLATE.left) / 4;
    expect(comb.lines[0]!.runs[0]!.x).toBeCloseTo(PLATE.left + cell / 2 - 3, 3);
    expect(runsOf(layoutField('שלום', FONTS, { ...FIELD, password: true }))).toEqual([
      [['helvetica', '****', false]],
    ]);
  });
  test('a comb sets a cursive letter in the form the whole text gives it, measured so', () => {
    // Joined forms 100 narrower on each joined side, as a joiner (U+200D) asks for them.
    const arabic: TextFont = {
      ...fakeFont('arabic', [[0x0600, 0x06ff]]),
      width: (text) =>
        [...text].filter((c) => !/[\p{M}\u200d]/u.test(c)).length * 600 -
        [...text].filter((c) => c === '\u200d').length * 100,
    };
    const fonts: TextFonts = { face: HELVETICA, fallbacks: [arabic], lastResort: LAST_RESORT };
    const laid = layoutField('مرحبا', fonts, { ...FIELD, cells: 5 });
    const runs = laid.lines[0]!.runs;
    expect(runs.map((run) => [run.text, run.joinsPrevious, run.joinsNext])).toEqual([
      ['م', false, true],
      ['ر', true, false],
      ['ح', false, true],
      ['ب', true, true],
      ['ا', true, false],
    ]);
    // Each in the middle of its cell, by its joined width.
    const cell = (PLATE.right - PLATE.left) / 5;
    const widths = [500, 500, 500, 400, 500].map((thousandths) => (thousandths * 12) / 1000);
    runs.forEach((run, index) => {
      expect(run.width).toBeCloseTo(widths[index]!, 3);
      expect(run.x).toBeCloseTo(PLATE.left + cell * (index + 0.5) - widths[index]! / 2, 3);
    });
    // Outside a comb nothing is drawn alone: no run joins.
    expect(
      layoutField('مرحبا', fonts, FIELD).lines[0]!.runs.every(
        (run) => !run.joinsPrevious && !run.joinsNext,
      ),
    ).toBe(true);
  });
});

describe('joining', () => {
  test("letters join as the engine's shaper reads Unicode's joining types", () => {
    const type = (c: string) => joiningTypeOf(c.codePointAt(0)!);
    expect(['ب', 'ا', 'ر', 'ـ', 'ء', '\u064e', '\u200d', '\u200c', 'ܐ', 'A'].map(type)).toEqual([
      'D',
      'R',
      'R',
      'C',
      'U',
      'T',
      'C',
      'U',
      'R',
      'U',
    ]);
  });

  test('a pair joins where the first joins what follows and the second what precedes it', () => {
    const joins = (word: string) =>
      joinsOf(graphemesOf(word).map(([begin, end]) => word.slice(begin, end))).map(
        (join) => `${join.previous ? '<' : ''}${join.next ? '>' : ''}`,
      );
    expect(joins('مرحبا')).toEqual(['>', '<', '>', '<>', '<']);
    // Marks ride with their letter.
    expect(joins('م\u064eر\u0652ح\u064eب\u064bا')).toEqual(['>', '<', '>', '<>', '<']);
    // A space, Latin, a non-joiner: nothing joins across them.
    expect(joins('بب ب')).toEqual(['>', '<', '', '']);
    expect(joins('ب\u200cب')).toEqual(['', '', '']);
    expect(joins('ab')).toEqual(['', '']);
  });
});
