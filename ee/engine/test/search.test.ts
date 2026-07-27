import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runSearchConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'sample.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

// sample.pdf is the USCIS Form I-140 (8 pages); "Form I-140" sits in every
// page header and page 0 has indirect object number 3056 — the same fixture
// facts the engine-local suite pins. Here the identical suite drives the
// cloud engine: POST slices through the layer search route, the server-side
// SearchReader on the native worker pool, and the docVersion-pinned cursor
// envelope across the wire.
const TENANT_ID = 'cloud-search-tenant';
const DOC_ID = 'docsearch001';
const PAGE_OBJECT_NUMBER = 3056;
const PAGE_COUNT = 8;

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-search-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, samplePath, PAGE_COUNT);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runSearchConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: {
    id: DOC_ID,
    bytes: async () => new Uint8Array(),
    expected: { trapped: 'unknown' },
    presentLiteral: 'Form I-140',
    presentPageObjectNumber: PAGE_OBJECT_NUMBER,
    absentLiteral: 'zyxqvark never appears anywhere',
    presentRegex: 'I-\\d{3}',
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
  },
});
