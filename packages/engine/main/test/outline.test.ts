import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runOutlineConformance,
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
runOutlineConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, bytes) =>
    engine.open({ kind: 'bytes', id: `outline-${opened++}`, bytes }, { scope: ['*'] }),
  openReadOnly: (engine, bytes) =>
    engine.open(
      { kind: 'bytes', id: `outline-${opened++}`, bytes },
      { scope: ['doc.open', 'doc.render'] },
    ),
});
