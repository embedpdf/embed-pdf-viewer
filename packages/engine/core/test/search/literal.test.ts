import { describe, expect, test } from 'vitest';
import { foldOptionsFor, foldText, matchLiteral } from '../../src/shared';
import type { SearchQuery } from '../../src/shared';

function find(text: string, query: SearchQuery) {
  return matchLiteral(foldText(text, foldOptionsFor(query)), query);
}

describe('matchLiteral', () => {
  test('finds a plain match', () => {
    expect(find('Hello World', { text: 'World' })).toEqual([{ start: 6, length: 5 }]);
  });

  test('is case-insensitive by default', () => {
    expect(find('Hello World', { text: 'world' })).toEqual([{ start: 6, length: 5 }]);
  });

  test('matchCase demands exact case', () => {
    expect(find('Hello World', { text: 'world', matchCase: true })).toEqual([]);
    expect(find('Hello World', { text: 'World', matchCase: true })).toEqual([
      { start: 6, length: 5 },
    ]);
  });

  test('ignores diacritics by default, both directions', () => {
    expect(find('Le café était', { text: 'cafe' })).toEqual([{ start: 3, length: 4 }]);
    expect(find('the cafe', { text: 'café' })).toEqual([{ start: 4, length: 4 }]);
  });

  test('matchDiacritics demands the marks', () => {
    expect(find('Le café était', { text: 'cafe', matchDiacritics: true })).toEqual([]);
    expect(find('Le café était', { text: 'café', matchDiacritics: true })).toEqual([
      { start: 3, length: 4 },
    ]);
  });

  test('matches across line wraps (whitespace collapse)', () => {
    // Text reflowed across a newline + indent.
    expect(find('hello\n   world', { text: 'hello world' })).toEqual([{ start: 0, length: 14 }]);
  });

  test('by default a needle must carry a space wherever the page does', () => {
    expect(find('Ref: i n v o i c e 42', { text: 'invoice' })).toEqual([]);
    expect(find('Invoice 42', { text: 'i n v o i c e' })).toEqual([]);
  });

  test('ignoreWhitespace finds letter-spaced text and spans the gaps', () => {
    // The OCR / tracked-out-heading case: "i n v o i c e" on the page, "invoice" typed.
    expect(find('Ref: i n v o i c e 42', { text: 'invoice', ignoreWhitespace: true })).toEqual([
      { start: 5, length: 13 },
    ]);
  });

  test('ignoreWhitespace drops whitespace on the needle side too', () => {
    expect(find('Invoice 42', { text: 'i n v o i c e', ignoreWhitespace: true })).toEqual([
      { start: 0, length: 7 },
    ]);
    expect(find('totalamount', { text: 'total amount', ignoreWhitespace: true })).toEqual([
      { start: 0, length: 11 },
    ]);
  });

  test('ignoreWhitespace matches across line wraps without a space in the needle', () => {
    expect(find('in\nvoice', { text: 'invoice', ignoreWhitespace: true })).toEqual([
      { start: 0, length: 8 },
    ]);
  });

  test('ignoreWhitespace composes with matchCase', () => {
    expect(
      find('I n v o i c e', { text: 'invoice', ignoreWhitespace: true, matchCase: true }),
    ).toEqual([]);
    expect(
      find('I n v o i c e', { text: 'Invoice', ignoreWhitespace: true, matchCase: true }),
    ).toEqual([{ start: 0, length: 13 }]);
  });

  test('ignoreWhitespace + wholeWord reads boundaries off the original text', () => {
    // Dropping whitespace glues "i n v o i c e" to the "42" after it on the
    // folded plane; the original text still has a gap there, so it is a whole word.
    expect(
      find('Ref: i n v o i c e 42', { text: 'invoice', ignoreWhitespace: true, wholeWord: true }),
    ).toEqual([{ start: 5, length: 13 }]);
    // ...while a hit glued to letters in the original is still rejected.
    expect(
      find('the invoices', { text: 'invoice', ignoreWhitespace: true, wholeWord: true }),
    ).toEqual([]);
  });

  test('ignoreWhitespace with a whitespace-only needle finds nothing', () => {
    expect(find('anything', { text: ' \n ', ignoreWhitespace: true })).toEqual([]);
  });

  test('finds ligature text with a plain-letters needle', () => {
    expect(find('ﬁle system', { text: 'file' })).toEqual([{ start: 0, length: 3 }]);
  });

  test('multiple non-overlapping matches, advancing past each', () => {
    expect(find('aaa', { text: 'aa' })).toEqual([{ start: 0, length: 2 }]);
    expect(find('ab ab ab', { text: 'ab' })).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 2 },
      { start: 6, length: 2 },
    ]);
  });

  test('wholeWord rejects sub-word hits', () => {
    expect(find('concatenate cat scatter', { text: 'cat', wholeWord: true })).toEqual([
      { start: 12, length: 3 },
    ]);
  });

  test('wholeWord accepts hits at text edges and punctuation boundaries', () => {
    expect(find('cat', { text: 'cat', wholeWord: true })).toEqual([{ start: 0, length: 3 }]);
    expect(find('a cat, dog', { text: 'cat', wholeWord: true })).toEqual([{ start: 2, length: 3 }]);
  });

  test('empty and whitespace-only needles match nothing', () => {
    expect(find('anything', { text: '' })).toEqual([]);
    expect(find('anything', { text: '   ' })).toEqual([]);
  });

  test('needle longer than text matches nothing', () => {
    expect(find('ab', { text: 'abc' })).toEqual([]);
  });
});
