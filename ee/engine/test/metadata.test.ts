import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runMetadataConformance,
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

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-metadata-tenant';
const DOC_ID = 'sample-pdf-cloud';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-conformance-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, samplePath, 8);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runMetadataConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: {
    id: DOC_ID,
    bytes: async () => new Uint8Array(),
    expected: {
      trapped: 'unknown',
    },
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, DOC_ID),
    });
  },
});
