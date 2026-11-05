import { foldText } from './fold';
import { searchQueryOf, type SearchQuery } from './types';

/**
 * Canonicalize a query for cache keying: default-fold literal queries are
 * pre-folded ("Café", "café" and "CAFE" are the same search, so they
 * should be the same cache entry). Semantics are unchanged — the fold is
 * idempotent and exactly what the matcher applies to the needle anyway.
 * Case- or diacritic-sensitive literals and regex patterns pass through
 * untouched (their raw form is the query).
 */
export function canonicalSearchQuery(request: SearchQuery): SearchQuery {
  const query = searchQueryOf(request);
  if (query.regex || query.matchCase || query.matchDiacritics || query.ignoreWhitespace) {
    return query;
  }
  const canonical: SearchQuery = { text: foldText(query.text).folded };
  if (query.wholeWord) canonical.wholeWord = true;
  return canonical;
}
