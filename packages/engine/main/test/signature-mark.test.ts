import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runSignatureMarkConformance,
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

runSignatureMarkConformance(runner, {
  label: 'engine-local (inline transport)',
  makeEngine: () => createLocalEngine(),
  open: (engine, bytes) =>
    engine.open({ kind: 'bytes', id: `signature-mark-${++opened}`, bytes }, { scope: ['*'] }),
});

// The same marks on the runtime a browser runs: an image is decoded there too.
runSignatureMarkConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, bytes) =>
    engine.open({ kind: 'bytes', id: `signature-mark-wasm-${++opened}`, bytes }, { scope: ['*'] }),
});
