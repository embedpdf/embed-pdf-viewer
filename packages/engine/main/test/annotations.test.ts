import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationReadConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runAnnotationReadConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'annotations-pdf',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: { trapped: 'unknown' },
    pageObjectNumber: 3,
    expectedAnnotationCount: 14,
    minHighlightCount: 4,
    minUnsupportedCount: 1,
    minCircleCount: 1,
    minSquareCount: 1,
    minPolygonCount: 1,
    minPolylineCount: 1,
    minLineCount: 1,
    minInkCount: 1,
    minFreeTextCount: 2,
    minCaretCount: 1,
    expectsWeakAnnotation: true,
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
