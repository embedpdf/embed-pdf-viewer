import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  PRINT_RULES_PDF,
  runPrintCopyConformance,
  runPrintRenderConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import type { Engine } from '@embedpdf/engine-core/runtime';

import { createLocalEngine } from '../src/index';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

const label = 'engine-local (inline transport, wasm runtime)';
const makeEngine = () => createLocalEngine({ runtime: { prefer: 'wasm' } });
const open = (engine: Engine, scope: readonly string[]) =>
  engine.open(
    { kind: 'bytes', id: `print-rules-${opened++}`, bytes: PRINT_RULES_PDF.slice() },
    { scope: [...scope] },
  );

runPrintRenderConformance(runner, { label, makeEngine, open });

runPrintCopyConformance(runner, {
  label,
  makeEngine,
  open,
  openCopy: (engine, bytes) =>
    engine.open({ kind: 'bytes', id: `print-copy-${opened++}`, bytes }, { scope: ['*'] }),
});
