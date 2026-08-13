import { describe, expect, it } from 'vitest';

import { normalizeQuery, queryTerms } from '../src/search/terms';

describe('lexical query terms', () => {
  it('prefix-matches every term so results arrive while typing', () => {
    expect(queryTerms('annot')).toEqual(['annot']);
    expect(queryTerms('thumbnail grid')).toEqual(['thumbnail', 'grid']);
  });

  it('splits identifiers on their separators instead of quoting them', () => {
    expect(queryTerms('fit-width')).toEqual(['fit', 'width']);
    expect(queryTerms('@embedpdf/react')).toEqual(['embedpdf', 'react']);
    expect(queryTerms('EPDFForm_GetValue')).toEqual(['epdfform', 'getvalue']);
  });

  it('cannot emit anything but plain alphanumeric terms, whatever is typed', () => {
    expect(queryTerms('a && b | c:*')).toEqual(['a', 'b', 'c']);
    expect(queryTerms("'; DROP TABLE docs_search_sections; --")).toEqual([
      'drop',
      'table',
      'docs',
      'search',
      'sections',
    ]);
  });

  it('has nothing to search for in punctuation alone', () => {
    expect(queryTerms('!!!')).toEqual([]);
    expect(queryTerms('   ')).toEqual([]);
    expect(queryTerms('')).toEqual([]);
  });

  it('caps term count so a pasted sentence cannot AND itself to nothing', () => {
    expect(queryTerms('one two three four five six seven eight nine ten')).toHaveLength(8);
  });

  it('normalises whitespace and case for the embedding cache key', () => {
    expect(normalizeQuery('  How   Do I ZOOM ')).toBe('how do i zoom');
  });
});
