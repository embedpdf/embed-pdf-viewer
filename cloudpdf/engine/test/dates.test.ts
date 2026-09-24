import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runDateConformance, type ConformanceTestRunner } from '@embedpdf/engine-core/conformance';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'dates.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-date-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-date-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runDateConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  // Each test opens its own copy: the metadata test writes to its document.
  open: async (engine) => {
    if (!fx) throw new Error('fixture not initialised');
    const id = `dates-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, id, fixture, 1);
    return engine.open({ kind: 'id', id });
  },
});
