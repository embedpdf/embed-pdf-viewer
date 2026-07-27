import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runPageFlattenConformance,
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
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'runtime',
  'runtime-src',
  'testing',
  'resources',
  'flatten_selective.pdf',
);
const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};
let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-flatten-conformance-tenant';
const DOC_ID = 'flatten-selective-cloud';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-flatten-conformance-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runPageFlattenConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: { id: DOC_ID, bytes: async () => new Uint8Array(), expected: {} },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
});
