import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runTextDivergenceConformance,
  TEXT_DIVERGENCE_CASES,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// The divergence fixtures live in the PDFium fork's test corpus (bug_1139 and
// the ActualText fixture are upstream; the astral ToUnicode one is ours) so
// the same PDFs also feed the C++ embeddertests.
const resources = resolve(here, '..', '..', 'runtime', 'runtime-src', 'testing', 'resources');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

for (const [key, c] of Object.entries(TEXT_DIVERGENCE_CASES)) {
  runTextDivergenceConformance(runner, {
    label: 'engine-local (inline transport, wasm runtime)',
    openKind: 'bytes',
    makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
    fixture: {
      ...c,
      id: `divergence-${key}`,
      bytes: async () => new Uint8Array(await readFile(resolve(resources, c.resource))),
      expected: {},
    },
  });
}
