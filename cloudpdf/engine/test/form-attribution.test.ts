import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CHANGE_FIXTURE_PDF,
  runFormAttributionConformance,
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
 * Field attribution on the cloud engine, against `@cloudpdf/server` on the
 * native runtime: the server stamps it from the token's identity.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-form-attribution-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-form-attribution-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runFormAttributionConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl });
  },
  // A later session continues on the same document's default layer.
  openAs: async (engine, { scope, identity }, from) => {
    if (!fx) throw new Error('fixture not initialised');
    let docId = from?.id;
    if (!docId) {
      docId = `form-attribution-${++docs}`;
      await seedDocument(fx, TENANT_ID, docId, CHANGE_FIXTURE_PDF);
    }
    const token = docScopedToken(fx, TENANT_ID, docId, scope, undefined, identity);
    return engine.open({ kind: 'token', token });
  },
});
