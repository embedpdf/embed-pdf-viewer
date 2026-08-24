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
    // The v2-class case: text reflowed across a newline + indent.
    expect(find('hello\n   world', { text: 'hello world' })).toEqual([{ start: 0, length: 14 }]);
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
