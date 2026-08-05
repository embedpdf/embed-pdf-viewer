import { describe, expect, test } from 'vitest';
import {
  decodeSearchToken,
  decodeTokenText,
  encodeSearchToken,
  encodeTokenText,
} from '../../src/wire';
import type { SearchToken } from '../../src/wire';

describe('token text codec', () => {
  test('round-trips arbitrary text inside the token value charset', () => {
    for (const text of [
      'hello world',
      'Form I-140',
      'café über straße',
      'ﬁle 😀 \u{1D49C}',
      'a=b,c&d?e/f+g',
      ' ',
    ]) {
      const encoded = encodeTokenText(text);
      expect(encoded).toMatch(/^[A-Za-z0-9.-]+$/);
      expect(decodeTokenText(encoded)).toBe(text);
    }
  });

  test('rejects malformed input', () => {
    expect(() => decodeTokenText('ab_cd')).toThrow(/malformed/);
    expect(() => decodeTokenText('abcde')).toThrow(/malformed/);
  });
});

describe('search token codec', () => {
  test('round-trips the full state', () => {
    const token: SearchToken = {
      epoch: 'a1b2c3d4e5f60718',
      query: { text: 'net income', wholeWord: true },
      startPage: 3056,
      skip: 128,
      budget: { maxPages: 1, maxMatches: 50 },
    };
    expect(decodeSearchToken(encodeSearchToken(token))).toEqual(token);
  });

  test('round-trips regex queries', () => {
    const token: SearchToken = {
      epoch: '00000000000000ff',
      query: { text: 'I-\\d{3}', regex: true, matchCase: true },
      skip: 0,
    };
    expect(decodeSearchToken(encodeSearchToken(token))).toEqual(token);
  });

  test('canonical: defaults are omitted, equal searches are byte-equal', () => {
    const a = encodeSearchToken({
      epoch: 'e',
      query: { text: 'x', matchCase: undefined, wholeWord: undefined },
      skip: 0,
    });
    const b = encodeSearchToken({ epoch: 'e', query: { text: 'x' }, skip: 0 });
    expect(a).toBe(b);
    expect(a).not.toContain('matchCase');
    expect(a).not.toContain('skip');
  });

  test('the token is URL-path safe', () => {
    const token = encodeSearchToken({
      epoch: 'a1b2c3d4e5f60718',
      query: { text: 'was kostet das? 50%/Tag' },
      skip: 64,
    });
    expect(encodeURIComponent(token)).toBe(token.replace(/,/g, '%2C').replace(/=/g, '%3D'));
    expect(token).toMatch(/^[A-Za-z0-9.=,-]+$/);
  });

  test('rejects tokens missing required fields', () => {
    expect(() => decodeSearchToken('epoch=ff')).toThrow(/missing "q"/);
    expect(() => decodeSearchToken('q=aGk')).toThrow(/missing "epoch"/);
    expect(() => decodeSearchToken('not a token')).toThrow();
  });
});
