import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runFormConformance, type ConformanceTestRunner } from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// Vendored from the engine-runtime fork's testing/resources so the suite runs
// without the multi-GB runtime-src submodule — see fixtures/README.md for
// provenance and the re-sync command.
const resources = resolve(here, 'fixtures');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const fixture = (id: string, file: string) => ({
  id,
  bytes: async () => new Uint8Array(await readFile(resolve(resources, file))),
  expected: {},
});

runFormConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixtures: {
    toggleFields: { ...fixture('toggle-fields-pdf', 'toggle_fields.pdf'), pageObjectNumber: 3 },
    orphanWidgets: fixture('orphan-widgets-pdf', 'orphan_widgets.pdf'),
    choiceFields: fixture('listbox-form-pdf', 'listbox_form.pdf'),
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
