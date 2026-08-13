/**
 * Builds this site's documentation search artifact: `public/search-index.bin`.
 *
 * Runs before `next build` in the deploy pipeline (and on `pnpm dev` start),
 * so the artifact always describes exactly the content the deployment
 * renders — docs pages AND the generated API reference, which indexes
 * through the same component projections the `.md` export uses. Sections
 * are content-hashed against the previous artifact, so a rebuild only pays
 * for embeddings that actually changed — and with no OPENAI_API_KEY it
 * writes a lexical-only index instead of failing.
 *
 *   pnpm run search:index          # loud: an embedding failure is fatal
 *   pnpm run search:index:build    # deploy: outages degrade, never fail
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

import { buildSearchArtifact } from '@embedpdf/docs-kit/search';

import { searchExtractSite } from '../src/lib/search-site';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

try {
  loadEnvFile(path.resolve(scriptDirectory, '../.env.local'));
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
}

async function main() {
  await buildSearchArtifact({
    site: searchExtractSite,
    contentRoot: path.resolve(scriptDirectory, '../src/content'),
    outFile: path.resolve(scriptDirectory, '../public/search-index.bin'),
    revision: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local',
    force: process.argv.includes('--force'),
    tolerateEmbeddingFailure: process.argv.includes('--if-configured'),
    log: (line) => process.stdout.write(`${line}\n`),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
