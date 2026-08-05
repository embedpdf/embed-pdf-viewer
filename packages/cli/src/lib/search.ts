/**
 * Searches EmbedPDF documentation via the search API.
 * The API uses pre-computed vector embeddings for semantic search.
 */

const SEARCH_API_URL =
  process.env.EMBEDPDF_API_URL || 'https://www.embedpdf.com/api/search';

export interface SearchResult {
  path: string;
  title: string;
  description: string;
  url: string;
  framework: string | null;
  section: string | null;
  score: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
}

export async function searchDocs(
  query: string,
  options?: {
    framework?: string;
    section?: string;
    limit?: number;
  },
): Promise<SearchResponse> {
  const response = await fetch(SEARCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      framework: options?.framework,
      section: options?.section,
      limit: options?.limit ?? 10,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Search API error (${response.status}): ${error}`);
  }

  return response.json();
}
