import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationAppearanceConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'ebook-annotated.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runAnnotationAppearanceConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  supportsRawRasters: true,
  fixture: {
    id: 'ebook-annotated-pdf',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: { trapped: 'unknown' },
    pageObjectNumber: 2,
    minAppearanceCount: 4,
    expectsWeakAppearance: false,
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
