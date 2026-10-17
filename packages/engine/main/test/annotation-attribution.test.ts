import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationAttributionConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const authoring = resolve(here, 'fixtures', 'measure-acrobat-imperial.pdf');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runAnnotationAttributionConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  openAs: async (engine, { scope, identity }, from) => {
    const bytes = from ? await from.download() : new Uint8Array(await readFile(authoring));
    return engine.open(
      { kind: 'bytes', id: `attribution-${++opened}`, bytes },
      { scope, identity },
    );
  },
});
