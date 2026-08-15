import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPageGeometryOrientationConformance,
  type ConformanceTestRunner,
  type PageGeometryOrientationFixture,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureBytes = (name: string) => async () =>
  new Uint8Array(await readFile(resolve(here, 'fixtures', name)));

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

// All five fixtures come from the PDFium fork's test corpus
// (runtime-src/testing/resources) — the same PDFs the native embeddertests
// pin — and use indirect object 3 as their single page.
const fixtures: PageGeometryOrientationFixture[] = [
  {
    // 45°-family rotated text in all four quadrants (0.7071 matrices).
    id: 'rotated-text',
    bytes: fixtureBytes('rotated_text.pdf'),
    expected: {},
    pageObjectNumber: 3,
    expectation: {
      kind: 'rotated',
      rotations: [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4],
      ascentFlip: false,
      minRotatedRuns: 4,
    },
  },
  {
    // Fake italic: shear-only matrix [1 0 0.5 1] — rotation 0, parallelogram
    // cells. The case an AABB representation cannot express.
    id: 'sheared-text',
    bytes: fixtureBytes('sheared_text.pdf'),
    expected: {},
    pageObjectNumber: 3,
    expectation: { kind: 'rotated', rotations: [0], ascentFlip: false, sheared: true },
  },
  {
    // Horizontal mirror [-1 0 0 1]: baseline angle π with a flipped ascent.
    id: 'mirrored-text',
    bytes: fixtureBytes('mirrored_text.pdf'),
    expected: {},
    pageObjectNumber: 3,
    expectation: { kind: 'rotated', rotations: [Math.PI], ascentFlip: true },
  },
  {
    // Vertical CJK writing uses an UPRIGHT matrix — the guard that vertical
    // text stays on the unchanged upright path.
    id: 'vertical-text',
    bytes: fixtureBytes('vertical_text.pdf'),
    expected: {},
    pageObjectNumber: 3,
    expectation: { kind: 'upright' },
  },
  {
    // `/F1 0 Tf` — degenerate glyphs only (the fork's crash regression).
    id: 'font-size-zero',
    bytes: fixtureBytes('font_size_zero.pdf'),
    expected: {},
    pageObjectNumber: 3,
    expectation: { kind: 'empty-only' },
  },
];

for (const fixture of fixtures) {
  runPageGeometryOrientationConformance(runner, {
    label: 'engine-local (inline transport, wasm runtime)',
    openKind: 'bytes',
    fixture,
    makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  });
}
