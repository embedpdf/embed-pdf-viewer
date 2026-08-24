import {
  writeSearchArtifact,
  loadSearchArtifact,
  SEARCH_ARTIFACT_VERSION,
  type SearchArtifactSection,
} from './artifact';
import {
  collectCorpus,
  contentHashFor,
  embeddingTextFor,
  sectionId,
  symbolsTextFor,
  variantProseTextFor,
} from './corpus';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embedTexts, isEmbeddingConfigured } from './embed';
import type { SearchExtractSite } from './extract';

const EMBEDDING_BATCH = 96;

export type BuildSearchArtifactOptions = {
  site: SearchExtractSite;
  /** Absolute path of the site's content root (the parent of `docs/`). */
  contentRoot: string;
  /** Where the artifact lands (typically `public/search-index.bin`). */
  outFile: string;
  revision?: string;
  /** Re-embed everything, ignoring the previous artifact's vectors. */
  force?: boolean;
  /**
   * Deploy mode: a provider outage keeps the vectors already reused and
   * ships the rest lexical-only, instead of failing the site build. Run
   * without it and an embedding failure is fatal — then a human is watching
   * and wants to know.
   */
  tolerateEmbeddingFailure?: boolean;
  log?: (line: string) => void;
};

export type BuildSearchArtifactResult = {
  pages: number;
  sections: number;
  embedded: number;
  reused: number;
  model: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeRow(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

/**
 * Builds (or refreshes) a site's `search-index.bin`.
 *
 * The previous artifact IS the embedding cache: sections whose indexable
 * content hash matches a stored section reuse its vector for free, so a
 * docs-only commit re-embeds the handful of sections it touched — and a
 * rebuild with untouched docs re-embeds nothing.
 */
export async function buildSearchArtifact({
  site,
  contentRoot,
  outFile,
  revision = 'local',
  force = false,
  tolerateEmbeddingFailure = false,
  log = () => {},
}: BuildSearchArtifactOptions): Promise<BuildSearchArtifactResult> {
  const pages = collectCorpus(site, contentRoot);
  const sections: SearchArtifactSection[] = pages.flatMap((page) =>
    page.sections.map((section) => ({
      ...section,
      id: sectionId(section),
      hash: contentHashFor(section),
      symbolsText: symbolsTextFor(section),
      variantProseText: variantProseTextFor(section),
      vectorRow: -1,
    })),
  );

  if (sections.length === 0) {
    throw new Error('The docs corpus produced no sections; refusing to write an empty index.');
  }
  log(`[search-index] ${pages.length} pages → ${sections.length} sections (revision ${revision}).`);

  // Vectors reusable from the previous build, keyed by content hash.
  const previousVectors = new Map<string, Float32Array>();
  if (!force) {
    try {
      const previous = loadSearchArtifact(outFile);
      if (
        previous.meta.version === SEARCH_ARTIFACT_VERSION &&
        previous.meta.model === EMBEDDING_MODEL &&
        previous.meta.dimensions === EMBEDDING_DIMENSIONS
      ) {
        for (const section of previous.meta.sections) {
          if (section.vectorRow >= 0) {
            const offset = section.vectorRow * previous.meta.dimensions;
            previousVectors.set(
              section.hash,
              previous.vectors.subarray(offset, offset + previous.meta.dimensions),
            );
          }
        }
      }
    } catch {
      /* no previous artifact, or an unreadable one — full build */
    }
  }

  const rows: Float32Array[] = [];
  let reused = 0;
  let embedded = 0;

  const claimRow = (vector: Float32Array): number => {
    rows.push(vector);
    return rows.length - 1;
  };

  const configured = isEmbeddingConfigured();
  const stale: SearchArtifactSection[] = [];

  for (const section of sections) {
    const cached = previousVectors.get(section.hash);
    if (cached) {
      section.vectorRow = claimRow(cached);
      reused += 1;
    } else if (configured) {
      stale.push(section);
    }
  }

  if (!configured) {
    log(
      `[search-index] OPENAI_API_KEY is not set — writing a lexical-only index. ` +
        'Semantic ranking stays off until the key is present.',
    );
  } else if (stale.length === 0) {
    log('[search-index] Every embedding is current.');
  } else {
    log(
      `[search-index] Embedding ${stale.length} changed section(s) with ` +
        `${EMBEDDING_MODEL} at ${EMBEDDING_DIMENSIONS} dimensions.`,
    );
    try {
      for (const batch of chunk(stale, EMBEDDING_BATCH)) {
        const vectors = await embedTexts(batch.map(embeddingTextFor));
        if (vectors.length !== batch.length) {
          throw new Error(`Expected ${batch.length} embeddings, received ${vectors.length}.`);
        }
        batch.forEach((section, index) => {
          section.vectorRow = claimRow(Float32Array.from(normalizeRow(vectors[index])));
          embedded += 1;
        });
        log(`[search-index] Embedded ${embedded}/${stale.length}.`);
      }
    } catch (error) {
      // Whatever did come back is still worth keeping: sections without a
      // vector stay lexical-only and retry by content hash next build.
      if (!tolerateEmbeddingFailure) throw error;
      log(`[search-index] Embedding failed; shipping ${embedded + reused} vectors: ${error}`);
    }
  }

  const dimensions = EMBEDDING_DIMENSIONS;
  const matrix = new Float32Array(rows.length * dimensions);
  rows.forEach((row, index) => matrix.set(row, index * dimensions));

  writeSearchArtifact(
    outFile,
    {
      version: SEARCH_ARTIFACT_VERSION,
      model: configured ? EMBEDDING_MODEL : null,
      dimensions,
      vectorCount: rows.length,
      builtAt: new Date().toISOString(),
      revision,
      sections,
    },
    matrix,
  );

  log(
    `[search-index] Wrote ${outFile} — ${sections.length} sections, ` +
      `${rows.length} vectors (${reused} reused, ${embedded} embedded).`,
  );

  return { pages: pages.length, sections: sections.length, embedded, reused, model: configured ? EMBEDDING_MODEL : null };
}
