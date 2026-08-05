/**
 * Builds the documentation search index into Postgres.
 *
 * Runs after `db:migrate` in the deploy pipeline. Sections are content-hashed,
 * so a rebuild only pays for embeddings that actually changed — a docs-only
 * commit re-embeds the handful of sections it touched, not the corpus.
 *
 *   pnpm run search:index              # local, requires DATABASE_URL
 *   pnpm run search:index:build        # deploy, no-ops when unconfigured
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

import { neon } from '@neondatabase/serverless';

import {
  collectCorpus,
  contentHashFor,
  embeddingTextFor,
  sectionId,
  symbolsTextFor,
  variantProseTextFor,
} from '../src/lib/search/corpus';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embedTexts,
  isEmbeddingConfigured,
  toVectorLiteral,
} from '../src/lib/search/embed';
import type { DocsSection } from '../src/lib/search/types';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

try {
  loadEnvFile(path.resolve(scriptDirectory, '../.env.local'));
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
}

async function main() {
  const optional = process.argv.includes('--if-configured');
  const force = process.argv.includes('--force');
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!connectionString) {
    if (optional) {
      process.stdout.write('Search database is not configured; skipping index build.\n');
      process.exit(0);
    }
    throw new Error('Set DATABASE_URL or POSTGRES_URL before building the search index.');
  }

  const sql = neon(connectionString);
  const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local';

  /**
   * Neon's HTTP driver sends a whole transaction in one request, so writes are
   * chunked to keep payloads sane — a 512-dim vector is a few KB of text on its
   * own. Chunks are not globally atomic, which is fine here: every row is an
   * idempotent upsert keyed by section id, so a reader mid-run sees a mix of
   * fresh and stale sections and never a torn one.
   */
  const METADATA_CHUNK = 40;
  const EMBEDDING_CHUNK = 20;
  const EMBEDDING_BATCH = 96;

  function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  type IndexedSection = DocsSection & { id: string; hash: string };

  const pages = collectCorpus();
  const sections: IndexedSection[] = pages.flatMap((page) =>
    page.sections.map((section) => ({
      ...section,
      id: sectionId(section),
      hash: contentHashFor(section),
    })),
  );

  if (sections.length === 0) {
    throw new Error('The docs corpus produced no sections; refusing to wipe the index.');
  }

  process.stdout.write(
    `[search-index] ${pages.length} pages → ${sections.length} sections (revision ${revision}).\n`,
  );

  const existingRows = (await sql`
    SELECT id, content_hash, (embedding IS NOT NULL) AS has_embedding
    FROM docs_search_sections
  `) as { id: string; content_hash: string; has_embedding: boolean }[];

  const existing = new Map(existingRows.map((row) => [row.id, row]));

  // Metadata is cheap, so it is always refreshed: a retitled page or a changed
  // breadcrumb must show up even when the indexed text is byte-identical.
  for (const batch of chunk(sections, METADATA_CHUNK)) {
    await sql.transaction((tx) =>
      batch.map(
        (section) => tx`
          INSERT INTO docs_search_sections (
            id, content_path, anchor, page_title, page_description, section_title,
            breadcrumb, product, depth, ordinal, prose, variant_prose, symbols,
            symbols_text, variant_prose_text, content_hash, revision, indexed_at
          ) VALUES (
            ${section.id},
            ${section.contentPath},
            ${section.anchor},
            ${section.pageTitle},
            ${section.pageDescription},
            ${section.sectionTitle},
            ${JSON.stringify(section.breadcrumb)}::jsonb,
            ${section.product},
            ${section.depth},
            ${section.ordinal},
            ${section.prose},
            ${JSON.stringify(section.variantProse)}::jsonb,
            ${JSON.stringify(section.symbols)}::jsonb,
            ${symbolsTextFor(section)},
            ${variantProseTextFor(section)},
            ${section.hash},
            ${revision},
            now()
          )
          ON CONFLICT (id) DO UPDATE SET
            content_path = EXCLUDED.content_path,
            anchor = EXCLUDED.anchor,
            page_title = EXCLUDED.page_title,
            page_description = EXCLUDED.page_description,
            section_title = EXCLUDED.section_title,
            breadcrumb = EXCLUDED.breadcrumb,
            product = EXCLUDED.product,
            depth = EXCLUDED.depth,
            ordinal = EXCLUDED.ordinal,
            prose = EXCLUDED.prose,
            variant_prose = EXCLUDED.variant_prose,
            symbols = EXCLUDED.symbols,
            symbols_text = EXCLUDED.symbols_text,
            variant_prose_text = EXCLUDED.variant_prose_text,
            content_hash = EXCLUDED.content_hash,
            revision = EXCLUDED.revision,
            indexed_at = now()
        `,
      ),
    );
  }

  const stale = sections.filter((section) => {
    if (force) return true;
    const previous = existing.get(section.id);
    return !previous || !previous.has_embedding || previous.content_hash !== section.hash;
  });

  if (!isEmbeddingConfigured()) {
    process.stdout.write(
      `[search-index] OPENAI_API_KEY is not set — indexed ${sections.length} sections for ` +
        'lexical search only. Semantic ranking stays off until the key is present.\n',
    );
  } else if (stale.length === 0) {
    process.stdout.write('[search-index] Every embedding is current.\n');
  } else {
    process.stdout.write(
      `[search-index] Embedding ${stale.length} changed section(s) with ` +
        `${EMBEDDING_MODEL} at ${EMBEDDING_DIMENSIONS} dimensions.\n`,
    );

    const embeddings = new Map<string, number[]>();
    let embeddingError: unknown = null;

    try {
      for (const batch of chunk(stale, EMBEDDING_BATCH)) {
        const vectors = await embedTexts(batch.map(embeddingTextFor));
        if (vectors.length !== batch.length) {
          throw new Error(`Expected ${batch.length} embeddings, received ${vectors.length}.`);
        }
        batch.forEach((section, index) => embeddings.set(section.id, vectors[index]));
        process.stdout.write(`[search-index] Embedded ${embeddings.size}/${stale.length}.\n`);
      }
    } catch (error) {
      // A provider outage must not fail the whole site deploy. Metadata is
      // already written, so search still works lexically, and these sections
      // stay stale by content hash — the next deploy simply retries them.
      // Run manually (no --if-configured) and the failure is fatal, because
      // then a human is watching and wants to know.
      if (!optional) throw error;
      embeddingError = error;
    }

    // Whatever did come back is still worth storing: a partial batch failure
    // should not discard the batches that succeeded.
    for (const batch of chunk([...embeddings], EMBEDDING_CHUNK)) {
      await sql.transaction((tx) =>
        batch.map(
          ([id, embedding]) => tx`
            UPDATE docs_search_sections
            SET embedding = ${toVectorLiteral(embedding)}::vector
            WHERE id = ${id}
          `,
        ),
      );
    }

    if (embeddingError) {
      process.stdout.write(
        `[search-index] WARNING: embeddings failed after ${embeddings.size}/${stale.length} ` +
          `section(s). Search stays available and ranks lexically; the next deploy retries ` +
          `the rest. Cause: ${embeddingError instanceof Error ? embeddingError.message : embeddingError}\n`,
      );
    }
  }

  const removed = (await sql`
    DELETE FROM docs_search_sections
    WHERE id <> ALL(${sections.map((section) => section.id)}::text[])
    RETURNING id
  `) as { id: string }[];

  if (removed.length > 0) {
    process.stdout.write(
      `[search-index] Removed ${removed.length} section(s) no longer in docs.\n`,
    );
  }

  // A model or dimension change invalidates every cached query vector.
  await sql`DELETE FROM docs_search_query_cache WHERE model <> ${EMBEDDING_MODEL}`;

  process.stdout.write('[search-index] Search index is current.\n');
}

main().catch((error) => {
  console.error('[search-index] Failed:', error);
  process.exit(1);
});
