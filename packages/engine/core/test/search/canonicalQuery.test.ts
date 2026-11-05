import { describe, expect, test } from 'vitest';
import { canonicalSearchQuery } from '../../src/shared';

describe('canonicalSearchQuery', () => {
  test('folds default literal queries to one cache identity', () => {
    const a = canonicalSearchQuery({ text: 'Café' });
    const b = canonicalSearchQuery({ text: 'CAFE' });
    expect(a).toEqual(b);
    expect(a).toEqual({ text: 'cafe' });
  });

  test('is idempotent', () => {
    const once = canonicalSearchQuery({ text: 'Straße  und\tmehr' });
    expect(canonicalSearchQuery(once)).toEqual(once);
  });

  test('preserves wholeWord and leaves sensitive/regex queries untouched', () => {
    expect(canonicalSearchQuery({ text: 'Cat', wholeWord: true })).toEqual({
      text: 'cat',
      wholeWord: true,
    });
    const caseSensitive = { text: 'Cat', matchCase: true } as const;
    expect(canonicalSearchQuery(caseSensitive)).toEqual(caseSensitive);
    const regex = { text: 'C\\d+', regex: true } as const;
    expect(canonicalSearchQuery(regex)).toEqual(regex);
    const whitespaceInsensitive = { text: 'i n v o i c e', ignoreWhitespace: true } as const;
    expect(canonicalSearchQuery(whitespaceInsensitive)).toEqual(whitespaceInsensitive);
  });
});
