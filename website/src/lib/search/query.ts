import 'server-only';

import { createHash } from 'node:crypto';

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

import { isDocsIntegration, type DocsIntegration } from '../docs-integrations';
import type { DocsProduct } from '../docs-products';
import { EMBEDDING_MODEL, embedQuery, toVectorLiteral } from './embed';
import { normalizeQuery, toTsQuery } from './tsquery';
import { urlForSection } from './url';
import {
  HIGHLIGHT_CLOSE,
  HIGHLIGHT_OPEN,
  type DocsSearchHit,
  type DocsSearchResponse,
} from './types';

export class SearchConfigurationError extends Error {}

/**
 * Reciprocal Rank Fusion constant. 60 is the value from the original RRF paper
 * and the usual default: high enough that neither retriever's top hit can
 * steamroll a result the other ranks well, which is the whole point of running
 * both.
 */
const RRF_K = 60;

/** How deep each retriever goes before fusion. */
const CANDIDATE_DEPTH = 50;

/** Stops one long page from filling the result list with its own sections. */
const MAX_PER_PAGE = 3;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!value) throw new SearchConfigurationError('The search database is not configured.');
  return value;
}

function queryHash(query: string): string {
  return createHash('sha256').update(`${EMBEDDING_MODEL}:${query}`).digest('hex').slice(0, 32);
}

type SectionRow = {
  content_path: string;
  anchor: string | null;
  page_title: string;
  section_title: string | null;
  breadcrumb: string[];
  product: DocsProduct | null;
  excerpt: string | null;
  prose: string;
  lexical_hit: boolean;
  semantic_hit: boolean;
  score: number;
};

type CachedVector = { embedding: number[]; cached: boolean };

/**
 * Query embeddings are the one external call on the request path. Docs traffic
 * repeats heavily, so the cache turns the common query into pure Postgres.
 */
async function queryEmbedding(
  sql: NeonQueryFunction<false, false>,
  normalized: string,
): Promise<CachedVector | null> {
  const hash = queryHash(normalized);

  const cached = (await sql`
    SELECT embedding::text AS embedding
    FROM docs_search_query_cache
    WHERE query_hash = ${hash} AND model = ${EMBEDDING_MODEL}
  `) as { embedding: string }[];

  if (cached[0]) {
    // Usage accounting must never delay or fail the search itself.
    void sql`
      UPDATE docs_search_query_cache
      SET hit_count = hit_count + 1, last_used_at = now()
      WHERE query_hash = ${hash}
    `.catch(() => {});
    return { embedding: JSON.parse(cached[0].embedding) as number[], cached: true };
  }

  const embedding = await embedQuery(normalized);
  if (!embedding) return null;

  void sql`
    INSERT INTO docs_search_query_cache (query_hash, query, model, embedding)
    VALUES (${hash}, ${normalized}, ${EMBEDDING_MODEL}, ${toVectorLiteral(embedding)}::vector)
    ON CONFLICT (query_hash) DO NOTHING
  `.catch(() => {});

  return { embedding, cached: false };
}

export type SearchOptions = {
  query: string;
  integration?: string | null;
  product?: string | null;
  limit?: number;
};

export async function searchDocs({
  query,
  integration,
  product,
  limit = DEFAULT_LIMIT,
}: SearchOptions): Promise<DocsSearchResponse> {
  const normalized = normalizeQuery(query);
  const tsQuery = toTsQuery(normalized);
  const readerIntegration = isDocsIntegration(integration ?? undefined)
    ? (integration as DocsIntegration)
    : null;

  const empty: DocsSearchResponse = {
    query,
    degraded: false,
    integration: readerIntegration,
    hits: [],
  };

  if (!tsQuery) return empty;

  const sql = neon(databaseUrl());
  const vector = await queryEmbedding(sql, normalized);
  const vectorLiteral = vector ? toVectorLiteral(vector.embedding) : null;
  const useSemantic = vectorLiteral !== null;
  const productFilter = product ?? null;
  const size = Math.min(Math.max(limit, 1), MAX_LIMIT);

  /**
   * One round-trip, both retrievers, fused in the database.
   *
   * When no vector is available the semantic CTE is switched off and the same
   * statement degrades to pure lexical ranking — which is why an embeddings
   * outage costs relevance rather than availability.
   */
  const rows = (await sql`
    WITH lexical AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(search_vector, websearch) DESC, ordinal
      ) AS rank
      FROM docs_search_sections, to_tsquery('english', ${tsQuery}) AS websearch
      WHERE search_vector @@ websearch
        AND (${productFilter}::text IS NULL OR product = ${productFilter})
      LIMIT ${CANDIDATE_DEPTH}
    ),
    semantic AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> ${vectorLiteral}::vector) AS rank
      FROM docs_search_sections
      WHERE ${useSemantic}
        AND embedding IS NOT NULL
        AND (${productFilter}::text IS NULL OR product = ${productFilter})
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${CANDIDATE_DEPTH}
    ),
    fused AS (
      SELECT
        COALESCE(lexical.id, semantic.id) AS id,
        COALESCE(1.0 / (${RRF_K} + lexical.rank), 0)
          + COALESCE(1.0 / (${RRF_K} + semantic.rank), 0) AS score,
        lexical.id IS NOT NULL AS lexical_hit,
        semantic.id IS NOT NULL AS semantic_hit
      FROM lexical
      FULL OUTER JOIN semantic ON lexical.id = semantic.id
    ),
    ranked AS (
      SELECT
        fused.*,
        ROW_NUMBER() OVER (
          PARTITION BY section.content_path ORDER BY fused.score DESC, section.ordinal
        ) AS page_rank
      FROM fused
      JOIN docs_search_sections section ON section.id = fused.id
    )
    SELECT
      section.content_path,
      section.anchor,
      section.page_title,
      section.section_title,
      section.breadcrumb,
      section.product,
      section.prose,
      ranked.lexical_hit,
      ranked.semantic_hit,
      ranked.score,
      ts_headline(
        'english',
        section.prose,
        to_tsquery('english', ${tsQuery}),
        'MaxFragments=1, MaxWords=32, MinWords=16, ShortWord=2, '
          || 'StartSel="' || ${HIGHLIGHT_OPEN} || '", StopSel="' || ${HIGHLIGHT_CLOSE} || '", '
          || 'FragmentDelimiter=" … "'
      ) AS excerpt
    FROM ranked
    JOIN docs_search_sections section ON section.id = ranked.id
    WHERE ranked.page_rank <= ${MAX_PER_PAGE}
    ORDER BY ranked.score DESC, section.content_path, section.ordinal
    LIMIT ${size}
  `) as SectionRow[];

  const hits: DocsSearchHit[] = rows.map((row) => ({
    contentPath: row.content_path,
    anchor: row.anchor,
    url: urlForSection(row.content_path, row.anchor, readerIntegration),
    pageTitle: row.page_title,
    sectionTitle: row.section_title,
    breadcrumb: Array.isArray(row.breadcrumb) ? row.breadcrumb : [],
    product: row.product,
    excerpt: (row.excerpt ?? row.prose).slice(0, 320),
    matchedBy: [
      ...(row.lexical_hit ? (['lexical'] as const) : []),
      ...(row.semantic_hit ? (['semantic'] as const) : []),
    ],
    score: Number(row.score),
  }));

  return { query, degraded: !useSemantic, integration: readerIntegration, hits };
}
