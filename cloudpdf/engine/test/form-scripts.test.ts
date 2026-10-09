import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CHANGE_FIXTURE_PDF,
  runFormScriptConformance,
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

/**
 * Field scripts and the calculation order on the cloud engine, against
 * `@cloudpdf/server` on the native runtime.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-form-scripts-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-form-scripts-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runFormScriptConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl });
  },
  open: async (engine, scope) => {
    if (!fx) throw new Error('fixture not initialised');
    const docId = `form-scripts-${++docs}`;
    await seedDocument(fx, TENANT_ID, docId, CHANGE_FIXTURE_PDF);
    return engine.open({ kind: 'token', token: docScopedToken(fx, TENANT_ID, docId, scope) });
  },
});
