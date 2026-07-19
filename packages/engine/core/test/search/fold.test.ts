import { describe, expect, test } from 'vitest';
import { foldText, toOriginalRange } from '../../src/shared';

describe('foldText', () => {
  test('lowercases and maps 1:1 for plain ASCII', () => {
    const f = foldText('Hello World');
    expect(f.folded).toBe('hello world');
    expect(Array.from(f.map)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('strips diacritics by default', () => {
    const f = foldText('Café');
    expect(f.folded).toBe('cafe');
    expect(Array.from(f.map)).toEqual([0, 1, 2, 3]);
  });

  test('keepMarks preserves combining marks (decomposed)', () => {
    const f = foldText('Café', { keepMarks: true });
    expect(f.folded).toBe('café');
    // Both the base letter and the mark come from the precomposed é.
    expect(f.map[3]).toBe(3);
    expect(f.map[4]).toBe(3);
  });

  test('keepCase preserves case', () => {
    expect(foldText('Hello', { keepCase: true }).folded).toBe('Hello');
  });

  test('expands ligatures with a shared origin index', () => {
    const f = foldText('ﬁle'); // ﬁle
    expect(f.folded).toBe('file');
    expect(Array.from(f.map)).toEqual([0, 0, 1, 2]);
  });

  test('folds ß to ss', () => {
    expect(foldText('straße').folded).toBe('strasse');
  });

  test('folds final sigma to sigma', () => {
    expect(foldText('ς').folded).toBe(foldText('σ').folded);
  });

  test('collapses whitespace runs to a single space', () => {
    const f = foldText('foo \n\t bar');
    expect(f.folded).toBe('foo bar');
    // The collapsed space maps to the first whitespace char of the run.
    expect(f.map[3]).toBe(3);
    expect(f.map[4]).toBe(7); // 'b'
  });

  test('collapses whitespace born from decomposition', () => {
    // U+00A8 DIAERESIS decomposes to space + combining mark.
    const f = foldText('a ¨ b');
    expect(f.folded).toBe('a b');
  });

  test('folds compatibility forms', () => {
    expect(foldText('²').folded).toBe('2'); // superscript two
  });

  test('preserves astral code points with paired mapping', () => {
    const f = foldText('\u{1F600}x'); // 😀x
    expect(f.folded).toBe('\u{1F600}x');
    expect(Array.from(f.map)).toEqual([0, 0, 2]);
  });

  test('empty input folds to empty', () => {
    const f = foldText('');
    expect(f.folded).toBe('');
    expect(f.map.length).toBe(0);
  });
});

describe('toOriginalRange', () => {
  test('maps a folded range back to original code units', () => {
    const f = foldText('Hello World');
    expect(toOriginalRange(f, 6, 5)).toEqual({ start: 6, length: 5 });
  });

  test('a hit inside a ligature covers the whole original char', () => {
    const f = foldText('ﬁle'); // folded "file"
    expect(toOriginalRange(f, 0, 2)).toEqual({ start: 0, length: 1 }); // "fi" → ﬁ
    expect(toOriginalRange(f, 0, 4)).toEqual({ start: 0, length: 3 }); // whole word
  });

  test('a range across collapsed whitespace spans the raw whitespace', () => {
    const f = foldText('hello\n   world');
    // folded "hello world" — the full match must cover all 14 original units.
    expect(toOriginalRange(f, 0, 11)).toEqual({ start: 0, length: 14 });
  });

  test('never splits a surrogate pair', () => {
    const f = foldText('\u{1F600}'); // one astral char, two folded units
    expect(toOriginalRange(f, 0, 1)).toEqual({ start: 0, length: 2 });
  });
});
