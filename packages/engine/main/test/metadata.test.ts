import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runMetadataConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runMetadataConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'sample-pdf',
    bytes: async () => new Uint8Array(await readFile(samplePath)),
    expected: {
      // The fixture is examples/engine-runtime-demo/public/sample.pdf. Real
      // metadata varies; we only assert that the trapped value is in the
      // expected set; the harness asserts the rest via toMatchObject and
      // a zero-key assertion is the same on local and cloud.
      trapped: 'unknown',
    },
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
