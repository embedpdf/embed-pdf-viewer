/**
 * Query-string handling for the lexical half of search. Pure, so it is unit
 * tested directly rather than through a database round-trip.
 */

/** Beyond this, extra terms narrow the AND to nothing useful. */
const MAX_TERMS = 8;

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds a prefix tsquery.
 *
 * Splitting on every non-alphanumeric run is both the tokenizer and the entire
 * sanitiser: each surviving term matches `[a-z0-9]+`, so `term:*` cannot carry
 * tsquery syntax no matter what was typed. `@embedpdf/react` and `fit-width`
 * become AND-ed terms — which is also how Postgres tokenised them on the way
 * in, so the two sides agree.
 *
 * Every term gets `:*` because docs search is as-you-type: "annot" has to find
 * annotations before the reader finishes the word.
 */
export function toTsQuery(query: string): string | null {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 0)
    .slice(0, MAX_TERMS);

  if (terms.length === 0) return null;
  return terms.map((term) => `${term}:*`).join(' & ');
}
