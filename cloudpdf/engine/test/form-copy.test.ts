import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runFormCopyConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const localFixtures = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
);
const fixtures = {
  authoring: resolve(localFixtures, 'hello_world.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-form-copy-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-form-copy-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runFormCopyConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () =>
    cloudEngine({ baseUrl: fixture().baseUrl, token: tenantToken(fixture(), TENANT_ID) }),
  // Each test opens its own copy: the tests write to their documents.
  open: async (engine, name) => {
    const id = `${name}-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures[name as 'authoring'], 1);
    return engine.open({ kind: 'id', id });
  },
  openScoped: async (engine, name, scope) => {
    const id = `${name}-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures[name as 'authoring'], 1);
    return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, id, scope) });
  },
});
