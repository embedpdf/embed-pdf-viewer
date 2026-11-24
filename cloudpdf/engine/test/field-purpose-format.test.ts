import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  FIELD_PURPOSE_FORMAT_PDF,
  runFieldPurposeFormatConformance,
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
 * A field's purpose and format on the cloud engine, against
 * `@cloudpdf/server` on the native runtime: each token on its own copy of
 * the fixture.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-field-purpose-format-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;
let users = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-field-purpose-format-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runFieldPurposeFormatConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, scope, identity, bytes = FIELD_PURPOSE_FORMAT_PDF) => {
    const docId = `field-purpose-format-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    const token = signDevToken(fixture().secret, {
      sub: `field-purpose-format-user-${++users}`,
      tenant_id: TENANT_ID,
      doc_id: docId,
      scope: [...scope],
      ...(Object.keys(identity).length > 0 ? { extras: { identity } } : {}),
    });
    return engine.open({ kind: 'token', token });
  },
});
