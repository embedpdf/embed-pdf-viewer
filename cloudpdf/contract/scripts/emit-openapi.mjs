// Writes the committed openapi.json from the operation registry.
// Run via `pnpm emit:openapi` (builds dist first). The freshness test
// in test/openapi.test.ts fails whenever the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';

import { buildAdminOpenApiDocument } from '../dist/openapi.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const doc = buildAdminOpenApiDocument({ version: pkg.version });
const target = new URL('../openapi.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote openapi.json (${pkg.version})`);
