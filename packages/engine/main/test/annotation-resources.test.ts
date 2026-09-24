import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationResourceConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = {
  authoring: resolve(here, 'fixtures', 'hello_world.pdf'),
  'acrobat-stamps': resolve(here, 'fixtures', 'stamp-opacity-acrobat.pdf'),
  'acrobat-rewrapped': resolve(here, 'fixtures', 'stamp-rewrapped-acrobat.pdf'),
  'acrobat-roundtrip-60': resolve(here, 'fixtures', 'stamp-roundtrip-acrobat-60.pdf'),
  'acrobat-roundtrip-100': resolve(here, 'fixtures', 'stamp-roundtrip-acrobat-100.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runAnnotationResourceConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: async (engine, fixture) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures[fixture])),
      },
      { scope: ['*'] },
    ),
  rawAppearances: true,
});
