import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runSearchConformance,
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

// sample.pdf is the USCIS Form I-140 (8 pages). "Form I-140" sits in
// every page header (multi-page match coverage) and page 3056 is the
// first page. The regex hits the same tokens via the digit class.
runSearchConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'sample-pdf',
    bytes: async () => new Uint8Array(await readFile(samplePath)),
    expected: { trapped: 'unknown' },
    presentLiteral: 'Form I-140',
    presentPageObjectNumber: 3056,
    absentLiteral: 'zyxqvark never appears anywhere',
    presentRegex: 'I-\\d{3}',
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
