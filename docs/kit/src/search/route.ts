import { NextResponse, type NextRequest } from 'next/server';

import { embedQuery } from './embed';
import { normalizeQuery } from './terms';
import { loadSearchIndex, searchIndex, type SearchIndexData } from './query';

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 160;

/** Query embeddings repeat heavily; a small in-process cache absorbs them. */
const QUERY_CACHE_LIMIT = 500;

export type DocsSearchRouteConfig = {
  /** Absolute path of the built artifact (resolve from `process.cwd()`). */
  artifactPath: string;
  /** Resolves a hit's URL for the requesting reader. */
  urlForSection: (contentPath: string, anchor: string | null, integration: string | null) => string;
  /** Validates ?integration= and the cookie value; absent = no integrations. */
  isIntegration?: (value: string) => boolean;
  /** Cookie carrying the reader's persisted integration preference. */
  integrationCookie?: string;
};

/**
 * Builds a site's `GET /api/search` handler over its search artifact.
 *
 * The artifact loads once per server instance (measured ~1.5 ms at real
 * corpus scale) and every query after that is pure memory plus, at most,
 * one query-embedding call — which an in-process LRU absorbs for the
 * repeats.
 */
export function createDocsSearchRoute({
  artifactPath,
  urlForSection,
  isIntegration = () => false,
  integrationCookie,
}: DocsSearchRouteConfig) {
  let data: SearchIndexData | null = null;
  let loadFailure: string | null = null;

  const queryCache = new Map<string, number[]>();

  const cachedEmbedQuery = async (normalized: string): Promise<number[] | null> => {
    const key = normalizeQuery(normalized);
    const hit = queryCache.get(key);
    if (hit) {
      // Refresh recency: Map iteration order is insertion order.
      queryCache.delete(key);
      queryCache.set(key, hit);
      return hit;
    }
    const vector = await embedQuery(key);
    if (vector) {
      queryCache.set(key, vector);
      if (queryCache.size > QUERY_CACHE_LIMIT) {
        const oldest = queryCache.keys().next().value;
        if (oldest !== undefined) queryCache.delete(oldest);
      }
    }
    return vector;
  };

  const load = (): SearchIndexData | null => {
    if (data || loadFailure) return data;
    try {
      data = loadSearchIndex(artifactPath);
    } catch (error) {
      loadFailure = error instanceof Error ? error.message : String(error);
      console.error('[search] Could not load the search artifact:', loadFailure);
    }
    return data;
  };

  async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const query = (searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);

    if (!query.trim()) {
      return NextResponse.json({ error: 'Missing required query parameter: q' }, { status: 400 });
    }

    const index = load();
    if (!index) {
      return NextResponse.json(
        { error: 'The search index has not been built for this deployment.' },
        { status: 503 },
      );
    }

    // An explicit integration wins; otherwise the reader's persisted
    // preference decides which framework's routes their results point at.
    const requested = searchParams.get('integration');
    const cookie = integrationCookie
      ? request.cookies.get(integrationCookie)?.value
      : undefined;
    const integration =
      requested && isIntegration(requested)
        ? requested
        : cookie && isIntegration(cookie)
          ? cookie
          : null;

    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10);

    try {
      const results = await searchIndex(index, {
        query,
        integration,
        product: searchParams.get('product'),
        limit: Number.isFinite(limit) ? limit : undefined,
        urlForSection,
        embedQuery: cachedEmbedQuery,
      });

      return NextResponse.json(results, {
        headers: {
          // Repeated queries are common enough that a short shared cache
          // takes real load off the embeddings provider.
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    } catch (error) {
      console.error('[search] Query failed:', error);
      return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 500 });
    }
  }

  return { GET };
}
