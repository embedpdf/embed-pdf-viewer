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
// Vendored from the engine-runtime fork's testing/resources so the suite runs
// without the multi-GB runtime-src submodule — see fixtures/README.md for
// provenance and the re-sync command.
const resources = resolve(here, 'fixtures');

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
