import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  PICTURE_BUTTON_PDF,
  runPictureButtonConformance,
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
runPictureButtonConformance(runner, {
  label: 'engine-local (inline transport)',
  makeEngine: () => createLocalEngine(),
  open: (engine, scope, identity, bytes = PICTURE_BUTTON_PDF) =>
    engine.open(
      { kind: 'bytes', id: `picture-button-${opened++}`, bytes: bytes.slice() },
      { scope: [...scope], identity },
    ),
});

// The same pictures on the runtime a browser runs: an image is decoded there too.
runPictureButtonConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine, scope, identity, bytes = PICTURE_BUTTON_PDF) =>
    engine.open(
      { kind: 'bytes', id: `picture-button-wasm-${opened++}`, bytes: bytes.slice() },
      { scope: [...scope], identity },
    ),
});
