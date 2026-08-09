#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
const operations = collectOperations(openapi);
const failures = [];

if (manifest.canonicalVersion !== openapi.info.version) {
  failures.push(
    `Version mismatch: OpenAPI is ${openapi.info.version}, snippets are ${manifest.canonicalVersion}`,
  );
}

const openapiSha256 = createHash('sha256').update(readFileSync(openapiPath)).digest('hex');
if (manifest.openapiSha256 !== openapiSha256) {
  failures.push('The snippet manifest was generated from a different OpenAPI document.');
}

const expectedOperationIds = new Set(operations.map((operation) => operation.operationId));
for (const operationId of expectedOperationIds) {
  for (const language of LANGUAGE_NAMES) {
    const snippet = manifest.operations?.[operationId]?.[language];
    if (!snippet?.source?.trim()) failures.push(`Missing snippet: ${operationId}:${language}`);
  }
}
for (const operationId of Object.keys(manifest.operations ?? {})) {
  if (!expectedOperationIds.has(operationId))
    failures.push(`Unknown snippet operation: ${operationId}`);
}

if (failures.length) {
  console.error(
    `API reference manifest validation failed:\n${failures.map((value) => `- ${value}`).join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `API reference manifest is valid (${operations.length} operations × ${LANGUAGE_NAMES.length} SDKs).`,
);
