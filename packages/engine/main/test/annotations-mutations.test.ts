import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationMutationConformance,
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
  'annotations.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runAnnotationMutationConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  supportsAppearanceRasters: true,
  fixture: {
    id: 'annotations-pdf-mutations',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: { trapped: 'unknown' },
    pageObjectNumber: 3,
    expectsWeakAnnotation: true,
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
