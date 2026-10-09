import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  FIELD_GROUPS_PDF,
  runFieldGroupsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * Field groups on the cloud engine, against `@cloudpdf/server` on the
 * native runtime: each party's token, with its identity, on its own copy
 * of the contract.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-field-groups-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;
let users = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-field-groups-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runFieldGroupsConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, scope, identity, bytes = FIELD_GROUPS_PDF) => {
    const docId = `field-groups-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    const token = signDevToken(fixture().secret, {
      sub: `field-groups-user-${++users}`,
      tenant_id: TENANT_ID,
      doc_id: docId,
      scope: [...scope],
      ...(Object.keys(identity).length > 0 ? { extras: { identity } } : {}),
    });
    return engine.open({ kind: 'token', token });
  },
  // The server judges a completion's CMS, so a placeholder can't complete
  // one; the lock is written at prepare, by the worker both engines share.
  completesSignings: false,
});
