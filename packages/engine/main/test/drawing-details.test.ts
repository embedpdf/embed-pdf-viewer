import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  DRAWING_FIXTURE_PDF,
  runDrawingDetailsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const acrobatFreeText = resolve(here, 'fixtures', 'freetext-rotated-acrobat.pdf');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runDrawingDetailsConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: async (engine, fixture) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes:
          fixture === 'drawing'
            ? DRAWING_FIXTURE_PDF.slice()
            : new Uint8Array(await readFile(acrobatFreeText)),
      },
      { scope: ['*'] },
    ),
});
