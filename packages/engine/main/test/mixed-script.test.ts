/**
 * Mixed-script text on the local engine, with the default fallback fonts it
 * comes with.
 */
import {
  BARE_PAGE_FIXTURE_PDF,
  runMixedScriptConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { localEngine } from '../src/index';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runMixedScriptConformance(runner, {
  label: 'local engine (wasm runtime)',
  openKind: 'bytes',
  fixture: { id: 'mixed-script', bytes: () => BARE_PAGE_FIXTURE_PDF.slice(), expected: {} },
  makeEngine: () => localEngine({ runtime: { prefer: 'wasm' } }),
});
