import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CHANGE_FIXTURE_PDF,
  runFormScriptConformance,
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

runFormScriptConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, scope) =>
    engine.open(
      { kind: 'bytes', id: `form-scripts-${++opened}`, bytes: CHANGE_FIXTURE_PDF.slice() },
      { scope },
    ),
});
