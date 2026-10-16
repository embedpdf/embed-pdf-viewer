import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  PRINT_RULES_PDF,
  runPrintRenderConformance,
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

runPrintRenderConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, scope) =>
    engine.open(
      { kind: 'bytes', id: `print-rules-${opened++}`, bytes: PRINT_RULES_PDF.slice() },
      { scope: [...scope] },
    ),
});
