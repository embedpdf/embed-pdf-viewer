import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  OBJECT_NUMBER_FIXTURE_PDF,
  runObjectNumberConformance,
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
runObjectNumberConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine) =>
    engine.open(
      { kind: 'bytes', id: `object-numbers-${opened++}`, bytes: OBJECT_NUMBER_FIXTURE_PDF.slice() },
      { scope: ['*'] },
    ),
});
