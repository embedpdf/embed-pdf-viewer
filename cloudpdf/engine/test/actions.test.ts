import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runActionsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
// Vendored engine-runtime corpus fixtures — canonical copy + provenance in
// packages/engine/main/test/fixtures/README.md (no submodule checkout needed).
const resources = resolve(here, '..', '..', '..', 'packages', 'engine', 'main', 'test', 'fixtures');
const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};
let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-actions-conformance-tenant';
const docs = {
  document: ['actions-document-cloud', 'document_aactions.pdf'],
  page: ['actions-page-cloud', 'get_page_aaction.pdf'],
  annotation: ['actions-annotation-cloud', 'annots_action_handling.pdf'],
  field: ['actions-field-cloud', 'annot_javascript.pdf'],
  payloads: ['actions-payloads-cloud', 'action_payloads.pdf'],
  openDestination: ['actions-open-dest-cloud', 'open_action_dest.pdf'],
} as const;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-actions-conformance-secret' });
  for (const [docId, file] of Object.values(docs)) {
    let fixturePath = resolve(resources, file);
    if (file === 'document_aactions.pdf') {
      // PDFium's upstream fixture deliberately declares three pages while its
      // page tree contains one. Local extraction tolerates the two synthetic
      // direct pages, but cloud documents require stable indirect page IDs.
      // Correct only the declared count; the byte width stays unchanged so the
      // fixture's xref offsets remain valid.
      const normalized = await readFile(fixturePath);
      const pageCount = normalized.indexOf(Buffer.from('/Count 3'));
      if (pageCount < 0) throw new Error('document_aactions.pdf page-count marker not found');
      normalized[pageCount + '/Count '.length] = '1'.charCodeAt(0);
      fixturePath = resolve(fx.storageRoot, 'document_aactions_cloud.pdf');
      await writeFile(fixturePath, normalized);
    }
    await seedDocumentFromBytes(fx, TENANT_ID, docId, fixturePath, 1);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

const fixture = (key: keyof typeof docs) => ({
  id: docs[key][0],
  bytes: async () => new Uint8Array(),
  expected: {},
});

runActionsConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixtures: {
    document: fixture('document'),
    page: fixture('page'),
    annotation: fixture('annotation'),
    field: fixture('field'),
    payloads: fixture('payloads'),
    openDestination: fixture('openDestination'),
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
});
