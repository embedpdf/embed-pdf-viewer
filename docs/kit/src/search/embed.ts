/**
 * The embedding provider seam.
 *
 * Everything else in the search stack talks to this file, so swapping OpenAI
 * for Vercel AI Gateway (or anything else) is a one-file change: point
 * `ENDPOINT` at the gateway and give it that key. Nothing above needs to know.
 */

const ENDPOINT = process.env.OPENAI_EMBEDDINGS_URL ?? 'https://api.openai.com/v1/embeddings';

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDINGS_MODEL ?? 'text-embedding-3-small';

/**
 * Matryoshka truncation: `text-embedding-3-small` is trained so a 512-dim
 * prefix keeps almost all retrieval quality at a third of the storage.
 * Changing this invalidates the artifact — its header records the dimensions
 * and the loader refuses a mismatch.
 */
export const EMBEDDING_DIMENSIONS = 512;

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set.');
  return key;
}

async function request(input: string | string[], signal?: AbortSignal): Promise<number[][]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: 'float',
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Embeddings request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  const data = payload.data;
  if (!data?.length) throw new Error('Embeddings response contained no vectors.');

  // The API documents ordered results, but the index is authoritative and a
  // silent misalignment here would poison every row it touches.
  return [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

/** Indexing path: batched, allowed to throw so a bad build fails loudly. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return request(texts);
}

/**
 * Query path: never throws.
 *
 * A docs search must not go down because a model provider does. On any failure
 * the caller drops to lexical-only results, which for identifier queries — the
 * majority — are the better results anyway.
 */
export async function embedQuery(query: string, timeoutMs = 800): Promise<number[] | null> {
  if (!isEmbeddingConfigured()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const [embedding] = await request(query, controller.signal);
    return embedding ?? null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[search] Dense retrieval unavailable, falling back to lexical:', error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
