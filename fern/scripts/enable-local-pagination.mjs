#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FERN_CLI_VERSION = '5.91.0';
export const PATCH_MARKER = 'cloudpdf-open-source-pagination';

const ENTITLEMENT_GATE = /generatePaginatedClients:([A-Za-z_$][\w$]*)\?\.paginationEnabled\?\?!1/g;

/**
 * Fern's Apache-licensed generators implement pagination, but CLI 5.91.0's
 * normal local-workspace path disables it when the hosted organization does
 * not carry the pagination entitlement. CloudPDF runs those generators
 * locally, so enable the already-present generator capability explicitly.
 */
export function enableLocalPagination(source) {
  if (source.includes(PATCH_MARKER)) return source;

  const matches = [...source.matchAll(ENTITLEMENT_GATE)];
  if (matches.length !== 1) {
    throw new Error(
      `Fern CLI pagination gate changed: expected exactly one match, found ${matches.length}`,
    );
  }

  return source.replace(ENTITLEMENT_GATE, `generatePaginatedClients:!0/* ${PATCH_MARKER} */`);
}

export function patchFernPackage(packageDirectory) {
  const manifestPath = resolve(packageDirectory, 'package.json');
  const cliPath = resolve(packageDirectory, 'cli.cjs');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== FERN_CLI_VERSION) {
    throw new Error(
      `Expected fern-api ${FERN_CLI_VERSION}, found ${String(manifest.version)}; review the pagination patch before upgrading`,
    );
  }

  const source = readFileSync(cliPath, 'utf8');
  const patched = enableLocalPagination(source);
  if (patched !== source) writeFileSync(cliPath, patched);
  return cliPath;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const packageDirectory = process.argv[2];
  if (!packageDirectory) {
    console.error('Usage: node fern/scripts/enable-local-pagination.mjs <fern-api-package-dir>');
    process.exit(2);
  }
  console.log(`enabled local SDK pagination in ${patchFernPackage(packageDirectory)}`);
}
