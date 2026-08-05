import { describe, expect, it } from 'vitest';

import { normalizeQuery, toTsQuery } from './tsquery';

describe('lexical query building', () => {
  it('prefix-matches every term so results arrive while typing', () => {
    expect(toTsQuery('annot')).toBe('annot:*');
    expect(toTsQuery('thumbnail grid')).toBe('thumbnail:* & grid:*');
  });

  it('splits identifiers on their separators instead of quoting them', () => {
    // Regression: emitting `fit width:*` as one term is a tsquery syntax error,
    // and Postgres rejects the whole statement rather than the one term.
    expect(toTsQuery('fit-width')).toBe('fit:* & width:*');
    expect(toTsQuery('@embedpdf/react')).toBe('embedpdf:* & react:*');
    expect(toTsQuery('EPDFForm_GetValue')).toBe('epdfform:* & getvalue:*');
  });

  it('cannot emit tsquery operators, whatever is typed', () => {
    expect(toTsQuery('a && b | c:*')).toBe('a:* & b:* & c:*');
    expect(toTsQuery("'; DROP TABLE docs_search_sections; --")).toBe(
      'drop:* & table:* & docs:* & search:* & sections:*',
    );
  });

  it('has nothing to search for in punctuation alone', () => {
    expect(toTsQuery('!!!')).toBeNull();
    expect(toTsQuery('   ')).toBeNull();
    expect(toTsQuery('')).toBeNull();
  });

  it('caps term count so a pasted sentence cannot AND itself to nothing', () => {
    const terms = toTsQuery('one two three four five six seven eight nine ten')?.split(' & ');
    expect(terms).toHaveLength(8);
  });

  it('normalises whitespace and case for the embedding cache key', () => {
    expect(normalizeQuery('  How   Do I ZOOM ')).toBe('how do i zoom');
  });
});
