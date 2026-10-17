import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runWidgetFindingConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/** Where the form finds widgets, on the cloud engine against `@cloudpdf/server`. */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-widget-finding-tenant';
let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-widget-finding-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runWidgetFindingConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, pdf, name) => {
    const docId = `widget-finding-${name}`;
    await seedDocument(fixture(), TENANT_ID, docId, pdf);
    return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, docId) });
  },
});
