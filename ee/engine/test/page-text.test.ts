import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runPageTextConformance,
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

// sample.pdf is the USCIS Form I-140 (8 pages); page 0 has indirect
// object number 3056 (verified via the wasm runtime probe). The
// engine-local suite asserts the same pon + substring against a
// WASM PDFium; here we exercise the same surface against the
// native PDFium worker pool over HTTP, with the versioned URL
// `/pages/3056/v1/text` and the manifest-driven cache invariant.
const TENANT_ID = 'cloud-page-text-tenant';
const DOC_ID = 'docptxt001';
const PAGE_OBJECT_NUMBER = 3056;
const PAGE_COUNT = 8;

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-page-text-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, samplePath, PAGE_COUNT);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runPageTextConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime, versioned URLs)',
  openKind: 'id',
  fixture: {
    id: DOC_ID,
    bytes: async () => new Uint8Array(),
    expected: { trapped: 'unknown' },
    pageObjectNumber: PAGE_OBJECT_NUMBER,
    expectedSubstring: 'Form I-140',
    minCharCount: 100,
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
  },
});
