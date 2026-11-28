import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runFieldLocksConformance,
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
runFieldLocksConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  makePermitEngine: () =>
    createLocalEngine({ runtime: { prefer: 'wasm' }, signedDocumentPolicy: 'permit' }),
  open: (engine, scope, identity, bytes) =>
    engine.open(
      { kind: 'bytes', id: `field-locks-${opened++}`, bytes: bytes.slice() },
      { scope: [...scope], identity },
    ),
});
