#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { extractSnippetManifest, readOpenApi, repositoryRootFrom } from './sdk-snippets.mjs';

const repositoryRoot = repositoryRootFrom(import.meta.url);
const outputPath = `${repositoryRoot}/cloudpdf/website/src/generated/sdk-snippets.json`;
const manifest = extractSnippetManifest({
  openapi: readOpenApi(repositoryRoot),
  repositoryRoot,
  artifactsRoot: process.env.SDK_ARTIFACTS_ROOT,
});
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outputPath, 'utf8');
  } catch {
    // Report the same actionable stale message for a missing manifest.
  }
  if (current !== serialized) {
    console.error('The committed SDK snippet manifest is stale.');
    console.error('Regenerate the workspace TypeScript SDK and six external SDKs, then run:');
    console.error('  pnpm --filter @cloudpdf/website api:snippets');
    process.exit(1);
  }
  console.log(
    `SDK snippet manifest is current (${Object.keys(manifest.operations).length} operations).`,
  );
  process.exit(0);
}

mkdirSync(`${repositoryRoot}/cloudpdf/website/src/generated`, { recursive: true });
writeFileSync(outputPath, serialized);
console.log(`Wrote ${outputPath}`);
