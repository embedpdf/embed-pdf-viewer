import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationTransferConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: Record<string, string> = {
  authoring: 'hello_world.pdf',
  'acrobat-stamps': 'stamp-opacity-acrobat.pdf',
  'acrobat-rewrapped': 'stamp-rewrapped-acrobat.pdf',
  'acrobat-roundtrip-60': 'stamp-roundtrip-acrobat-60.pdf',
  'acrobat-roundtrip-100': 'stamp-roundtrip-acrobat-100.pdf',
  'measure-imperial': 'measure-acrobat-imperial.pdf',
  'measure-metric': 'measure-acrobat-metric.pdf',
  'action-payloads': 'action_payloads.pdf',
  'annots-actions': 'annots_action_handling.pdf',
  'annot-javascript': 'annot_javascript.pdf',
  'link-javascript': 'link_javascript.pdf',
  dates: 'dates.pdf',
  'freetext-subset': 'freetext_document_subset_helvetica.pdf',
  'flatten-selective': 'flatten_selective.pdf',
  'embedded-attachments': 'embedded_attachments.pdf',
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;

runAnnotationTransferConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  fixtures: Object.keys(fixtures),
  open: async (engine, fixture) =>
    engine.open(
      {
        kind: 'bytes',
        id: `${fixture}-${++opened}`,
        bytes: new Uint8Array(await readFile(resolve(here, 'fixtures', fixtures[fixture]!))),
      },
      { scope: ['*'] },
    ),
  rawAppearances: true,
});
