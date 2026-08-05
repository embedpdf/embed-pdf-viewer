import { NextResponse, type NextRequest } from 'next/server';

import { INTEGRATION_COOKIE, isDocsIntegration } from '@/lib/docs-integrations';
import { SearchConfigurationError, searchDocs } from '@/lib/search/query';

export const dynamic = 'force-dynamic';

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 160;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = (searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);

  if (!query.trim()) {
    return NextResponse.json({ error: 'Missing required query parameter: q' }, { status: 400 });
  }

  // An explicit integration wins; otherwise the reader's persisted preference
  // decides which framework's routes their results point at.
  const requested = searchParams.get('integration') ?? undefined;
  const cookie = request.cookies.get(INTEGRATION_COOKIE)?.value;
  const integration = isDocsIntegration(requested)
    ? requested
    : isDocsIntegration(cookie)
      ? cookie
      : null;

  const limit = Number.parseInt(searchParams.get('limit') ?? '', 10);

  try {
    const results = await searchDocs({
      query,
      integration,
      product: searchParams.get('product'),
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json(results, {
      headers: {
        // Repeated queries are common enough that a short shared cache takes
        // real load off both Postgres and the embeddings provider.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    if (error instanceof SearchConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[search] Query failed:', error);
    return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 500 });
  }
}
