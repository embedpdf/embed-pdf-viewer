import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationAttributionConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const authoring = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'measure-acrobat-imperial.pdf',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-attribution-conformance-tenant';
const DOC_ID = 'attribution';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-attribution-conformance-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, authoring, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runAnnotationAttributionConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl });
  },
  // Every session writes to the document's default layer, so a later one sees what an earlier one wrote.
  openAs: (engine, { scope, identity }) => {
    if (!fx) throw new Error('fixture not initialised');
    const token = docScopedToken(fx, TENANT_ID, DOC_ID, scope, undefined, identity);
    return engine.open({ kind: 'token', token });
  },
});
