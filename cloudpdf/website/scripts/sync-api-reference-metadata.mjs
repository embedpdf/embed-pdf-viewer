#!/usr/bin/env node

// Re-stamps the committed snippet manifest with the current canonical version
// and OpenAPI hash WITHOUT regenerating any SDK. This is the cheap path for
// Changesets version bumps (ci:version), where the operation set is unchanged
// by construction. It refuses to run when snippet coverage has drifted — that
// situation needs `pnpm api:sync`, which regenerates stale SDKs and rebuilds
// the manifest from them.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import {
  collectOperations,
  LANGUAGE_NAMES,
  readOpenApi,
  repositoryRootFrom,
} from './sdk-snippets.mjs';

const repositoryRoot = repositoryRootFrom(import.meta.url);
const openapiPath = `${repositoryRoot}/cloudpdf/contract/openapi.json`;
const manifestPath = `${repositoryRoot}/cloudpdf/website/src/generated/sdk-snippets.json`;
const openapi = readOpenApi(repositoryRoot);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const expectedOperationIds = new Set(
  collectOperations(openapi).map((operation) => operation.operationId),
);

for (const operationId of expectedOperationIds) {
  for (const language of LANGUAGE_NAMES) {
    if (!manifest.operations?.[operationId]?.[language]?.source?.trim()) {
      throw new Error(
        `The snippet manifest has no ${operationId}:${language} snippet — the manifest is behind the OpenAPI contract. Run \`pnpm api:sync\` from the repository root.`,
      );
    }
  }
}
for (const operationId of Object.keys(manifest.operations ?? {})) {
  if (!expectedOperationIds.has(operationId)) {
    throw new Error(
      `The snippet manifest still contains ${operationId}, which is no longer in the OpenAPI contract. Run \`pnpm api:sync\` from the repository root.`,
    );
  }
}

manifest.canonicalVersion = openapi.info.version;
manifest.openapiSha256 = createHash('sha256').update(readFileSync(openapiPath)).digest('hex');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated API reference metadata for ${openapi.info.version}.`);
