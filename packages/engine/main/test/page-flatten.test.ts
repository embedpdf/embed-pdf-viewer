import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPageFlattenConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  'runtime',
  'runtime-src',
  'testing',
  'resources',
  'flatten_selective.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runPageFlattenConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'flatten-selective-local',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: {},
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
