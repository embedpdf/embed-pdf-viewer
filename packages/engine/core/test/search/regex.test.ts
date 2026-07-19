import { describe, expect, test } from 'vitest';
import {
  SEARCH_REGEX_MAX_LENGTH,
  matchRegex,
  validateSearchQuery,
  validateSearchRegex,
} from '../../src/shared';
import type { SearchQuery } from '../../src/shared';

const q = (pattern: string, matchCase?: boolean): SearchQuery => ({
  text: pattern,
  regex: true,
  matchCase,
});

describe('validateSearchRegex', () => {
  test('accepts ordinary patterns', () => {
    expect(validateSearchRegex('\\d+').ok).toBe(true);
    expect(validateSearchRegex('foo|bar').ok).toBe(true);
    expect(validateSearchRegex('[a-z]{2,4}\\.pdf').ok).toBe(true);
    expect(validateSearchRegex('\\p{L}+').ok).toBe(true);
  });

  test('accepts named GROUPS (not to be confused with lookbehind)', () => {
    expect(validateSearchRegex('(?<year>\\d{4})').ok).toBe(true);
  });

  test('rejects backreferences', () => {
    const v = validateSearchRegex('(a)\\1');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issue).toBe('backreference');
  });

  test('rejects named backreferences', () => {
    const v = validateSearchRegex('(?<x>a)\\k<x>');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issue).toBe('backreference');
  });

  test('rejects lookahead and lookbehind', () => {
    for (const p of ['(?=x)y', '(?!x)y', '(?<=x)y', '(?<!x)y']) {
      const v = validateSearchRegex(p);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.issue).toBe('lookaround');
    }
  });

  test('rejects syntax errors, empty, and oversized patterns', () => {
    expect(validateSearchRegex('(')).toMatchObject({ ok: false, issue: 'syntax' });
    expect(validateSearchRegex('')).toMatchObject({ ok: false, issue: 'empty' });
    expect(validateSearchRegex('a'.repeat(SEARCH_REGEX_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      issue: 'too-long',
    });
  });

  test('escaped digits inside a character class are not backreferences', () => {
    // `[\1]` is a u-mode syntax error, not a backreference — the issue
    // must say so.
    const v = validateSearchRegex('[\\1]');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.issue).toBe('syntax');
  });
});

describe('matchRegex', () => {
  test('finds all matches with original offsets', () => {
    expect(matchRegex('a 12 b 345', q('\\d+'))).toEqual([
      { start: 2, length: 2 },
      { start: 7, length: 3 },
    ]);
  });

  test('is case-insensitive by default; matchCase turns that off', () => {
    expect(matchRegex('FOO foo', q('foo'))).toEqual([
      { start: 0, length: 3 },
      { start: 4, length: 3 },
    ]);
    expect(matchRegex('FOO foo', q('foo', true))).toEqual([{ start: 4, length: 3 }]);
  });

  test('skips zero-length matches without looping forever', () => {
    expect(matchRegex('bbab', q('a*'))).toEqual([{ start: 2, length: 1 }]);
  });

  test('advances a full code point past empty matches on astral chars', () => {
    expect(matchRegex('\u{1F600}a', q('a*'))).toEqual([{ start: 2, length: 1 }]);
  });

  test('^ and $ match line boundaries (multiline page text)', () => {
    expect(matchRegex('ax\nbx', q('^b'))).toEqual([{ start: 3, length: 1 }]);
  });

  test('unicode property classes work (u-mode)', () => {
    expect(matchRegex('abc 123', q('\\p{L}+'))).toEqual([{ start: 0, length: 3 }]);
  });

  test('throws on dialect violations', () => {
    expect(() => matchRegex('x', q('(a)\\1'))).toThrow(/backreference/);
  });

  test('wholeWord post-filters at word boundaries', () => {
    // 'cat' standalone matches; inside 'concatenate' it does not.
    expect(matchRegex('cat concatenate cat', { ...q('cat'), wholeWord: true })).toEqual([
      { start: 0, length: 3 },
      { start: 16, length: 3 },
    ]);
  });

  test('wholeWord uses the UNICODE word test, not ASCII \\b', () => {
    // JS \b would treat the é in "café" as a boundary and match 'caf'
    // inside it; the shared word test must not — same semantics as the
    // literal path's wholeWord.
    expect(matchRegex('café caf', { ...q('caf'), wholeWord: true })).toEqual([
      { start: 5, length: 3 },
    ]);
  });

  test('wholeWord composes with alternation (the "why not hand-write \\b" case)', () => {
    expect(matchRegex('color colour colorful', { ...q('col(o|ou)r'), wholeWord: true })).toEqual([
      { start: 0, length: 5 },
      { start: 6, length: 6 },
    ]);
  });

  test('throws on regex + matchDiacritics', () => {
    expect(() => matchRegex('x', { ...q('a'), matchDiacritics: true })).toThrow(
      /diacritics-with-regex/,
    );
  });
});

describe('validateSearchQuery', () => {
  test('literal queries are always valid — even empty (finds nothing)', () => {
    expect(validateSearchQuery({ text: '' }).ok).toBe(true);
    expect(validateSearchQuery({ text: 'café', matchDiacritics: true }).ok).toBe(true);
  });

  test('regex queries validate the dialect', () => {
    expect(validateSearchQuery({ text: '\\d+', regex: true }).ok).toBe(true);
    expect(validateSearchQuery({ text: '(a)\\1', regex: true })).toMatchObject({
      ok: false,
      issue: 'backreference',
    });
    expect(validateSearchQuery({ text: '', regex: true })).toMatchObject({
      ok: false,
      issue: 'empty',
    });
  });

  test('regex + matchDiacritics is the one rejected flag combo', () => {
    expect(validateSearchQuery({ text: 'a', regex: true, matchDiacritics: true })).toMatchObject({
      ok: false,
      issue: 'diacritics-with-regex',
    });
    // every other combination is legal
    expect(
      validateSearchQuery({ text: 'a', regex: true, matchCase: true, wholeWord: true }).ok,
    ).toBe(true);
  });
});
