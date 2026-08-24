import type { SearchArtifactSection } from './artifact';

/**
 * The in-memory lexical channel — the artifact-world equivalent of the
 * weighted tsvector this stack used when it lived in Postgres. Fields carry
 * the same weights the old `search_vector` column assigned:
 *
 *   A  symbols + section title   (identifier queries are the majority)
 *   B  page title + description
 *   C  shared prose
 *   D  per-integration variant prose
 *
 * Matching is AND-of-prefixes over `[a-z0-9]+` tokens — the same tokenizer
 * the query side uses (`terms.ts`), so the two sides agree by construction.
 */

const FIELD_WEIGHTS = [1.0, 0.4, 0.2, 0.1] as const;

type PreparedSection = {
  /** Token lists per field, in weight order. */
  fields: string[][];
};

export type PreparedLexical = PreparedSection[];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Runs once at artifact load; queries then never touch the raw prose. */
export function prepareLexical(sections: SearchArtifactSection[]): PreparedLexical {
  return sections.map((section) => ({
    fields: [
      tokenize(`${section.symbolsText} ${section.sectionTitle ?? ''}`),
      tokenize(`${section.pageTitle} ${section.pageDescription ?? ''}`),
      tokenize(section.prose),
      tokenize(section.variantProseText),
    ],
  }));
}

export type LexicalRank = { index: number; score: number };

/**
 * Ranks candidate sections for a term list. Every term must prefix-match a
 * token in SOME field (AND semantics); a term scores its best field's weight
 * plus a small repeat bonus, so a section that says the word once in a title
 * outranks one that buries it in variant prose.
 */
export function rankLexical(
  prepared: PreparedLexical,
  terms: string[],
  candidates: number[],
  depth: number,
): LexicalRank[] {
  if (terms.length === 0) return [];

  const ranked: LexicalRank[] = [];

  for (const index of candidates) {
    const { fields } = prepared[index];
    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      let best = 0;
      let occurrences = 0;

      for (let field = 0; field < fields.length; field++) {
        for (const token of fields[field]) {
          if (token.startsWith(term)) {
            occurrences += 1;
            if (FIELD_WEIGHTS[field] > best) best = FIELD_WEIGHTS[field];
          }
        }
      }

      if (best === 0) {
        matchedAll = false;
        break;
      }
      score += best + Math.min(occurrences - 1, 4) * 0.01;
    }

    if (matchedAll) ranked.push({ index, score });
  }

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, depth);
}
