import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationDeclarationConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (id: string, path: string) => ({
  id,
  bytes: async () => new Uint8Array(await readFile(path)),
});

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runAnnotationDeclarationConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  authoring: fixture(
    'measure-acrobat-imperial',
    resolve(here, 'fixtures', 'measure-acrobat-imperial.pdf'),
  ),
  documents: [
    fixture(
      'annotations-pdf',
      resolve(
        here,
        '..',
        '..',
        '..',
        '..',
        'examples',
        'engine-runtime-demo',
        'public',
        'annotations.pdf',
      ),
    ),
    fixture('measure-acrobat-metric', resolve(here, 'fixtures', 'measure-acrobat-metric.pdf')),
  ],
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
