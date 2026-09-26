import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runMeasurementConformance,
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
for (const prefer of ['wasm', 'native'] as const) {
  runMeasurementConformance(runner, {
    label: `local ${prefer}`,
    openKind: 'bytes',
    fixture: {
      id: `measure-conformance-${prefer}`,
      expected: {},
      bytes: async () =>
        new Uint8Array(
          await readFile(
            new URL(
              '../../../../examples/engine-runtime-demo/public/annotations.pdf',
              import.meta.url,
            ),
          ),
        ),
    },
    makeEngine: () => createLocalEngine({ runtime: { prefer } }),
  });
}
