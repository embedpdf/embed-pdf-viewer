import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runWidgetFindingConformance,
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

runWidgetFindingConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, pdf, name) =>
    engine.open({ kind: 'bytes', id: `widget-finding-${name}`, bytes: pdf }, { scope: ['*'] }),
});
