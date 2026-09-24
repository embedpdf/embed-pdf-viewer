import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationResourceConformance,
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
  'acrobat-stamps': resolve(localFixtures, 'stamp-opacity-acrobat.pdf'),
  'acrobat-rewrapped': resolve(localFixtures, 'stamp-rewrapped-acrobat.pdf'),
  'acrobat-roundtrip-60': resolve(localFixtures, 'stamp-roundtrip-acrobat-60.pdf'),
  'acrobat-roundtrip-100': resolve(localFixtures, 'stamp-roundtrip-acrobat-100.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-annotation-resource-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-annotation-resource-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runAnnotationResourceConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  // Each test opens its own copy: the tests write to their document.
  open: async (engine, fixture) => {
    if (!fx) throw new Error('fixture not initialised');
    const id = `${fixture}-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, id, fixtures[fixture], 1);
    return engine.open({ kind: 'id', id });
  },
  rawAppearances: false,
});
