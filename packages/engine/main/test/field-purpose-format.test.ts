import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  FIELD_PURPOSE_FORMAT_PDF,
  runFieldPurposeFormatConformance,
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
runFieldPurposeFormatConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, scope, identity, bytes = FIELD_PURPOSE_FORMAT_PDF) =>
    engine.open(
      { kind: 'bytes', id: `field-purpose-format-${opened++}`, bytes: bytes.slice() },
      { scope: [...scope], identity },
    ),
});
