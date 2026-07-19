import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPageTextConformance,
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

// sample.pdf is the USCIS Form I-140 (8 pages). Page 0 has the
// indirect object number 3056 and ~2487 chars of extractable text
// starting with "Form I-140 Edition ...". The substring `Form I-140`
// appears on every page header, so the harness check is robust to
// PDFium tweaks that shuffle whitespace.
runPageTextConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'sample-pdf',
    bytes: async () => new Uint8Array(await readFile(samplePath)),
    expected: { trapped: 'unknown' },
    pageObjectNumber: 3056,
    expectedSubstring: 'Form I-140',
    minCharCount: 100,
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
