import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runActionsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const resources = resolve(here, '..', '..', 'pdf-runtime', 'runtime-src', 'testing', 'resources');
const localFixtures = resolve(here, 'fixtures');
const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};
const fixture = (id: string, file: string, dir = resources) => ({
  id,
  bytes: async () => new Uint8Array(await readFile(resolve(dir, file))),
  expected: {},
});

runActionsConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixtures: {
    document: fixture('actions-document-local', 'document_aactions.pdf'),
    page: fixture('actions-page-local', 'get_page_aaction.pdf'),
    annotation: fixture('actions-annotation-local', 'annots_action_handling.pdf'),
    field: fixture('actions-field-local', 'annot_javascript.pdf'),
    javascriptLink: fixture('actions-js-link-local', 'link_javascript.pdf', localFixtures),
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});
