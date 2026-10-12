import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  FIELD_GROUPS_PDF,
  runFieldGroupsConformance,
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
runFieldGroupsConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, scope, identity, bytes = FIELD_GROUPS_PDF) =>
    engine.open(
      { kind: 'bytes', id: `field-groups-${opened++}`, bytes: bytes.slice() },
      { scope: [...scope], identity },
    ),
});
