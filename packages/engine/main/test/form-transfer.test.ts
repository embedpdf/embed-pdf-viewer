import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runFormTransferConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runFormTransferConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  openAs: (engine, { scope, identity }, bytes) =>
    engine.open({ kind: 'bytes', id: `form-transfer-${++opened}`, bytes }, { scope, identity }),
});
