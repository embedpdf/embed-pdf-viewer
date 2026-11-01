import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  PAGE_PREDICTION_FIXTURE_PDF,
  runPagePredictionConformance,
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

runPagePredictionConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine) =>
    engine.open(
      { kind: 'bytes', id: 'page-prediction', bytes: PAGE_PREDICTION_FIXTURE_PDF.slice() },
      { scope: ['*'] },
    ),
});
