import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  CHANGE_FIXTURE_PDF,
  runChangeConformance,
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
 * `doc.apply` on the cloud engine, against `@cloudpdf/server` on the native
 * runtime: the same conformance suite as the local engine, with a second
 * user for who may undo what.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-change-conformance-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-change-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runChangeConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine) => {
    const docId = `changes-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, CHANGE_FIXTURE_PDF);
    return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, docId) });
  },
  // Another subject on the same layer.
  openAsAnotherUser: (engine, doc) =>
    engine.open({
      kind: 'token',
      token: signDevToken(fixture().secret, {
        sub: 'cloud-test-colleague',
        tenant_id: TENANT_ID,
        doc_id: doc.id,
        scope: ['*'],
      }),
    }),
});
