import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runFormTransferConformance,
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
 * Form transfer on the cloud engine, against `@cloudpdf/server` on the
 * native runtime: bundles move as multipart, each import one change.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-form-transfer-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-form-transfer-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runFormTransferConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl });
  },
  openAs: async (engine, { scope, identity }, bytes) => {
    if (!fx) throw new Error('fixture not initialised');
    const docId = `form-transfer-${++docs}`;
    await seedDocument(fx, TENANT_ID, docId, bytes);
    const token = docScopedToken(fx, TENANT_ID, docId, scope, undefined, identity);
    return engine.open({ kind: 'token', token });
  },
});
