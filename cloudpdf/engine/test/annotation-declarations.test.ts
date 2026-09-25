import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationDeclarationConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const engineFixtures = resolve(
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
const paths = {
  'annotations-pdf': resolve(
    here,
    '..',
    '..',
    '..',
    'examples',
    'engine-runtime-demo',
    'public',
    'annotations.pdf',
  ),
  'measure-acrobat-metric': resolve(engineFixtures, 'measure-acrobat-metric.pdf'),
  'measure-acrobat-imperial': resolve(engineFixtures, 'measure-acrobat-imperial.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-declaration-conformance-tenant';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-declaration-conformance-secret' });
  for (const [docId, path] of Object.entries(paths)) {
    await seedDocumentFromBytes(fx, TENANT_ID, docId, path, 1);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

const cloudFixture = (id: string) => ({ id, bytes: async () => new Uint8Array() });

runAnnotationDeclarationConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  authoring: cloudFixture('measure-acrobat-imperial'),
  documents: [cloudFixture('annotations-pdf'), cloudFixture('measure-acrobat-metric')],
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
});
