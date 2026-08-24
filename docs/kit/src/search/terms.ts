/**
 * Query-string handling for the lexical half of search. Pure, so it is unit
 * tested directly rather than through the whole retrieval pipeline.
 */

/** Beyond this, extra terms narrow the AND to nothing useful. */
const MAX_TERMS = 8;

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Tokenizes a query into prefix terms.
 *
 * Splitting on every non-alphanumeric run is both the tokenizer and the entire
 * sanitiser: each surviving term matches `[a-z0-9]+`, so nothing typed can
 * carry syntax anywhere. `@embedpdf/react` and `fit-width` become AND-ed
 * terms — the same way the index tokenized them on the way in, so the two
 * sides agree.
 *
 * Every term is matched as a prefix because docs search is as-you-type:
 * "annot" has to find annotations before the reader finishes the word.
 */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 0)
    .slice(0, MAX_TERMS);
}
