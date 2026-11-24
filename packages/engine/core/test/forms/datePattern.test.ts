import { describe, expect, test } from 'vitest';

import {
  isDatePattern,
  isTimePattern,
  STANDARD_DATE_PATTERNS,
  STANDARD_TIME_PATTERNS,
} from '../../src/forms/datePattern';

describe('date patterns', () => {
  test('a pattern is date groups, with separators between them, and may carry one time', () => {
    for (const pattern of [
      ...STANDARD_DATE_PATTERNS,
      'dd/mm/yyyy',
      'yyyy-mm-dd',
      'dd.mm.yyyy',
      'd mmmm, yyyy',
      'd',
      'yyyy',
      'mmmm',
      // A month's name between two numbers keeps them apart.
      'dmmmyy',
      'ddmmmmyyyy',
      // A time beside the date: hours, minutes after a colon, seconds after another, then its half of the day.
      'd H:MM',
      'd/m hh:MMtt',
      'dd.mm.yyyy h:MM  tt',
      'yyyy-mm-dd HH:MM:ss',
      'h:MM tt, d mmm',
      // A time that ends in letters can touch a number.
      'h:MM ttdd',
      // The longest: 64 characters.
      `dd${' '.repeat(58)}yyyy`,
    ]) {
      expect(isDatePattern(pattern), pattern).toBe(true);
    }
  });

  test('the year, the month and the day are each written once at most', () => {
    // Read back, a part written twice takes the next part's number, or the field refuses the text.
    for (const pattern of [
      'yyyy/mm/mm/dd',
      'dd/dd/mm/yyyy',
      'yyyy-yy-mm-dd',
      'd/m/yyyy d',
      // A month by its name and by its number are the month twice.
      'mmm mm d',
      'mmmm d, mmm yyyy',
      'd d',
      'yy yyyy',
      'm/d/yy HH:MM m',
      `${'dd/'.repeat(20)}yyyy`,
    ]) {
      expect(isDatePattern(pattern), pattern).toBe(false);
    }
    for (const pattern of ['yyyy/mm/dd', 'd mmmm yyyy', 'mmm yyyy', 'dd', 'yy-m']) {
      expect(isDatePattern(pattern), pattern).toBe(true);
    }
  });

  test('a time on its own is no date pattern: it is a time pattern', () => {
    for (const pattern of [
      ...STANDARD_TIME_PATTERNS,
      'H:MM',
      'hh:MM tt',
      'hh:MMtt',
      'HH:MM:ss tt',
      'HH:MM, ',
      ' h:MM',
    ]) {
      expect(isDatePattern(pattern), pattern).toBe(false);
    }
  });

  test('digits that touch are no pattern: they would read as one number', () => {
    for (const pattern of [
      'yyyymmdd',
      'ddmmyyyy',
      'ddmm',
      'mmyy',
      'dmyy',
      // A date's number against a time's.
      'ddHH:MM',
      'yyyyh:MM tt',
      'HH:MMdd',
      'HH:MM:ssyyyy',
    ]) {
      expect(isDatePattern(pattern), pattern).toBe(false);
    }
  });

  test('a time in another shape is no pattern: it is written and cannot be read back', () => {
    for (const pattern of [
      'HH.MM',
      'HH.MM.ss',
      'HH MM',
      'HHMM',
      'H:M',
      'HH:M',
      'HH:MM.ss',
      'HH:MM ss',
      'MM:HH',
      'ss:MM:HH',
      'HH',
      'MM',
      'ss',
      'tt',
      'h tt',
      'tt h:MM',
      'HH:MM - HH:MM',
      'h:MM tt tt',
      // A colon is a time's: between a date's groups it would read as one.
      'dd:mm:yyyy',
      'dd: mm',
    ]) {
      expect(isDatePattern(pattern), pattern).toBe(false);
    }
  });

  test('anything else is no pattern', () => {
    for (const pattern of [
      '',
      ' ',
      '/-.',
      'yyy',
      'yyyyy',
      'mmmmm',
      'ddd',
      'dddd',
      'y',
      's',
      'sss',
      't',
      'HHH',
      'D',
      'Y',
      'x',
      'dd/mm/yyyy"',
      "d 'of' mmmm",
      'dd\\mm',
      'dd;mm',
      'dd(mm)',
      'dd\nmm',
      'dd_mm',
      'yyyy年mm月',
      `dd${' '.repeat(59)}yyyy`,
      5,
      null,
      undefined,
      ['dd'],
    ]) {
      expect(isDatePattern(pattern), String(pattern)).toBe(false);
    }
  });

  test("each of Acrobat's own date patterns is one, the two with a time included", () => {
    for (const pattern of STANDARD_DATE_PATTERNS) {
      expect(isDatePattern(pattern), pattern).toBe(true);
      expect(isTimePattern(pattern), pattern).toBe(false);
    }
  });

  test('Acrobat numbers its date patterns from 0 to 13 and its time patterns from 0 to 3', () => {
    expect(STANDARD_DATE_PATTERNS).toHaveLength(14);
    expect(STANDARD_DATE_PATTERNS[0]).toBe('m/d');
    expect(STANDARD_DATE_PATTERNS[2]).toBe('mm/dd/yy');
    expect(STANDARD_DATE_PATTERNS[13]).toBe('m/d/yy HH:MM');
    expect(STANDARD_TIME_PATTERNS).toEqual(['HH:MM', 'h:MM tt', 'HH:MM:ss', 'h:MM:ss tt']);
  });

  test('the lists are data nothing can change', () => {
    expect(Object.isFrozen(STANDARD_DATE_PATTERNS)).toBe(true);
    expect(Object.isFrozen(STANDARD_TIME_PATTERNS)).toBe(true);
  });
});

describe('time patterns', () => {
  test('a pattern is a time and nothing else', () => {
    for (const pattern of [
      ...STANDARD_TIME_PATTERNS,
      'H:MM',
      'hh:MM',
      'h:MM',
      'hh:MM tt',
      'hh:MMtt',
      'h:MM  tt',
      'H:MM:ss',
      'hh:MM:sstt',
      'HH:MM:ss tt',
      `h:MM${' '.repeat(58)}tt`,
    ]) {
      expect(isTimePattern(pattern), pattern).toBe(true);
    }
  });

  test('a date in it is no time pattern: the time keystroke script reads no date', () => {
    for (const pattern of [
      ...STANDARD_DATE_PATTERNS,
      'dd/mm/yyyy',
      'yyyy',
      'd',
      'yyyy-mm-dd HH:MM:ss',
      'h:MM tt, d mmm',
      'h:MM ttdd',
      'd H:MM',
    ]) {
      expect(isTimePattern(pattern), pattern).toBe(false);
    }
  });

  test('a time in another shape is no pattern', () => {
    for (const pattern of [
      'HH.MM',
      'HH MM',
      'HHMM',
      'H:M',
      'HH:M',
      'HH:MM.ss',
      'HH:MM ss',
      'HH:MM:s',
      'MM:HH',
      'MM:ss',
      'ss:MM:HH',
      'HH',
      'MM',
      'ss',
      'tt',
      'h tt',
      'tt h:MM',
      'HH:MM - HH:MM',
      'h:MM tt tt',
      'h:MM t',
      'HHH:MM',
      'hhh:MM',
    ]) {
      expect(isTimePattern(pattern), pattern).toBe(false);
    }
  });

  test('anything around the time is no pattern', () => {
    for (const pattern of [
      '',
      ' ',
      ' HH:MM',
      'HH:MM ',
      'HH:MM tt ',
      'HH:MM,',
      'at HH:MM',
      'HH:MM"',
      'HH:MM\n',
      'HH:MM\\',
      `h:MM${' '.repeat(59)}tt`,
      5,
      null,
      undefined,
      ['HH:MM'],
    ]) {
      expect(isTimePattern(pattern), String(pattern)).toBe(false);
    }
  });
});
