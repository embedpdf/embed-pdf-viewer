import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CHANGE_FIXTURE_PDF,
  runFormAttributionConformance,
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

runFormAttributionConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  openAs: async (engine, { scope, identity }, from) => {
    const bytes = from ? await from.download() : CHANGE_FIXTURE_PDF.slice();
    return engine.open(
      { kind: 'bytes', id: `form-attribution-${++opened}`, bytes },
      { scope, identity },
    );
  },
});
