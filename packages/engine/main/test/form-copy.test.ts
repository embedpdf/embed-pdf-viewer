import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runFormCopyConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = {
  authoring: resolve(here, 'fixtures', 'hello_world.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runFormCopyConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: async (engine, fixture) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures[fixture as 'authoring'])),
      },
      { scope: ['*'] },
    ),
  openScoped: async (engine, fixture, scope) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes: new Uint8Array(await readFile(fixtures[fixture as 'authoring'])),
      },
      { scope: [...scope], identity: { userId: 'copier', displayName: 'Copier' } },
    ),
});
