import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  runOutlineConformance,
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
 * `doc.outline` on the cloud engine, against `@cloudpdf/server` on the native
 * runtime: the same conformance suite as the local engine.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-outline-conformance-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-outline-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runOutlineConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, bytes) => {
    const docId = `outline-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, docId) });
  },
  openReadOnly: async (engine, bytes) => {
    const docId = `outline-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    return engine.open({
      kind: 'token',
      token: signDevToken(fixture().secret, {
        sub: 'cloud-test-reader',
        tenant_id: TENANT_ID,
        doc_id: docId,
        scope: ['doc.open', 'doc.render'],
      }),
    });
  },
});
