import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CROP_OFFSET_PDF,
  runPageRenderConformance,
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

runPageRenderConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine) =>
    engine.open({ kind: 'bytes', id: 'crop-offset-render', bytes: CROP_OFFSET_PDF.slice() }),
});
