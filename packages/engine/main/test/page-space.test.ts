import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPageSpaceConformance,
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

runPageSpaceConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, fixture) =>
    engine.open({ kind: 'bytes', id: `page-space-${fixture.name}`, bytes: fixture.bytes.slice() }),
});
