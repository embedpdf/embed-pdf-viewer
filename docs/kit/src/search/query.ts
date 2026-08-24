import { loadSearchArtifact, type SearchArtifactMeta } from './artifact';
import { makeExcerpt } from './excerpt';
import { prepareLexical, rankLexical, type PreparedLexical } from './lexical';
import { normalizeQuery, queryTerms } from './terms';
import type { DocsSearchHit, DocsSearchResponse } from './types';

/**
 * The fused retrieval engine over a loaded artifact: the same
 * lexical + semantic Reciprocal Rank Fusion this stack ran in Postgres,
 * now in process memory. At real corpus scale the whole scan is ~2 ms;
 * query latency is dominated by the query-embedding API call, which any
 * vector design pays.
 */

/**
 * RRF constant. 60 is the value from the original RRF paper and the usual
 * default: high enough that neither retriever's top hit can steamroll a
 * result the other ranks well, which is the whole point of running both.
 */
const RRF_K = 60;

/** How deep each retriever goes before fusion. */
const CANDIDATE_DEPTH = 50;

/** Stops one long page from filling the result list with its own sections. */
const MAX_PER_PAGE = 3;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

export type SearchIndexData = {
  meta: SearchArtifactMeta;
  vectors: Float32Array;
  lexical: PreparedLexical;
};

/** Loads and prepares an artifact for querying. Call once per process. */
export function loadSearchIndex(filePath: string): SearchIndexData {
  const { meta, vectors } = loadSearchArtifact(filePath);
  return { meta, vectors, lexical: prepareLexical(meta.sections) };
}

type SemanticRank = { index: number; score: number };

function rankSemantic(
  data: SearchIndexData,
  queryVector: number[],
  candidates: number[],
): SemanticRank[] {
  const { meta, vectors } = data;
  const dimensions = meta.dimensions;

  // Normalize the query once; rows are unit-length from the build, so the
  // dot product IS the cosine similarity.
  let norm = 0;
  for (const value of queryVector) norm += value * value;
  norm = Math.sqrt(norm) || 1;

  const ranked: SemanticRank[] = [];
  for (const index of candidates) {
    const row = meta.sections[index].vectorRow;
    if (row < 0) continue;
    const offset = row * dimensions;
    let dot = 0;
    for (let i = 0; i < dimensions; i++) dot += vectors[offset + i] * queryVector[i];
    ranked.push({ index, score: dot / norm });
  }

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, CANDIDATE_DEPTH);
}

export type SearchIndexOptions = {
  query: string;
  /** Already validated by the caller; resolves result URLs. */
  integration?: string | null;
  product?: string | null;
  limit?: number;
  urlForSection: (contentPath: string, anchor: string | null, integration: string | null) => string;
  /** Query-embedding provider; null result = lexical-only (degraded). */
  embedQuery?: (normalized: string) => Promise<number[] | null>;
};

export async function searchIndex(
  data: SearchIndexData,
  { query, integration, product, limit = DEFAULT_LIMIT, urlForSection, embedQuery }: SearchIndexOptions,
): Promise<DocsSearchResponse> {
  const normalized = normalizeQuery(query);
  const terms = queryTerms(normalized);
  const readerIntegration = integration ?? null;

  const empty: DocsSearchResponse = {
    query,
    degraded: false,
    integration: readerIntegration,
    hits: [],
  };
  if (terms.length === 0) return empty;

  const { sections } = data.meta;
  const candidates: number[] = [];
  for (let index = 0; index < sections.length; index++) {
    if (!product || sections[index].product === product) candidates.push(index);
  }

  const lexical = rankLexical(data.lexical, terms, candidates, CANDIDATE_DEPTH);

  // The dense half only exists when the artifact carries vectors AND the
  // provider answers in time; every other path degrades to lexical-only.
  const wantSemantic = data.meta.model !== null && data.meta.vectorCount > 0;
  const queryVector = wantSemantic && embedQuery ? await embedQuery(normalized) : null;
  const semantic = queryVector ? rankSemantic(data, queryVector, candidates) : [];

  type Fused = { index: number; score: number; lexicalHit: boolean; semanticHit: boolean };
  const fused = new Map<number, Fused>();

  lexical.forEach((entry, rank) => {
    fused.set(entry.index, {
      index: entry.index,
      score: 1 / (RRF_K + rank + 1),
      lexicalHit: true,
      semanticHit: false,
    });
  });
  semantic.forEach((entry, rank) => {
    const existing = fused.get(entry.index);
    const contribution = 1 / (RRF_K + rank + 1);
    if (existing) {
      existing.score += contribution;
      existing.semanticHit = true;
    } else {
      fused.set(entry.index, {
        index: entry.index,
        score: contribution,
        lexicalHit: false,
        semanticHit: true,
      });
    }
  });

  const ordered = [...fused.values()].sort(
    (a, b) =>
      b.score - a.score ||
      sections[a.index].contentPath.localeCompare(sections[b.index].contentPath) ||
      sections[a.index].ordinal - sections[b.index].ordinal,
  );

  // Per-page cap, then the requested page size.
  const perPage = new Map<string, number>();
  const size = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const hits: DocsSearchHit[] = [];

  for (const entry of ordered) {
    if (hits.length >= size) break;
    const section = sections[entry.index];
    const seen = perPage.get(section.contentPath) ?? 0;
    if (seen >= MAX_PER_PAGE) continue;
    perPage.set(section.contentPath, seen + 1);

    hits.push({
      contentPath: section.contentPath,
      anchor: section.anchor,
      url: urlForSection(section.contentPath, section.anchor, readerIntegration),
      pageTitle: section.pageTitle,
      sectionTitle: section.sectionTitle,
      breadcrumb: section.breadcrumb,
      product: section.product,
      excerpt: makeExcerpt(section.prose, terms),
      matchedBy: [
        ...(entry.lexicalHit ? (['lexical'] as const) : []),
        ...(entry.semanticHit ? (['semantic'] as const) : []),
      ],
      score: entry.score,
    });
  }

  return {
    query,
    degraded: wantSemantic ? queryVector === null : data.meta.model === null,
    integration: readerIntegration,
    hits,
  };
}
