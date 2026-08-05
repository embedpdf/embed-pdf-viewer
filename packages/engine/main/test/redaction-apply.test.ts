import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runRedactionApplyConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// Vendored corpus fixture (see fixtures/README.md) — no submodule needed.
const fixturePath = resolve(here, 'fixtures', 'hello_world.pdf');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runRedactionApplyConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'redaction-apply-local',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: {},
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
