import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  APPEARANCE_STATES_FIXTURE_PDF,
  runAppearanceStatesConformance,
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
runAppearanceStatesConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine) =>
    engine.open(
      {
        kind: 'bytes',
        id: `appearance-states-${opened++}`,
        bytes: APPEARANCE_STATES_FIXTURE_PDF.slice(),
      },
      { scope: ['*'] },
    ),
});
