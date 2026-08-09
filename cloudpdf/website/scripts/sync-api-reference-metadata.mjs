#!/usr/bin/env node

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
        `Cannot refresh metadata: ${operationId}:${language} is missing. Regenerate the SDK snippets.`,
      );
    }
  }
}
for (const operationId of Object.keys(manifest.operations ?? {})) {
  if (!expectedOperationIds.has(operationId)) {
    throw new Error(
      `Cannot refresh metadata: ${operationId} is no longer in OpenAPI. Regenerate the SDK snippets.`,
    );
  }
}

manifest.canonicalVersion = openapi.info.version;
manifest.openapiSha256 = createHash('sha256').update(readFileSync(openapiPath)).digest('hex');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated API reference metadata for ${openapi.info.version}.`);
