import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import { createTestSigner, sign, type SignerPort } from '@embedpdf/core-signature';
import {
  ANYONE_FIELDS_PDF,
  runAnyoneFieldsConformance,
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
 * Fields anyone fills in on the cloud engine, against `@cloudpdf/server` on
 * the native runtime: each person's token, with their identity, on their own
 * copy of the form, signed with a test certificate since the server judges
 * a completion's CMS.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-anyone-fields-tenant';
let fx: DbSeededFixture | undefined;
let signer: SignerPort | undefined;
let docs = 0;
let users = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-anyone-fields-secret' });
  signer = await createTestSigner({ commonName: 'Anyone Fields Signer' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runAnyoneFieldsConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, scope, identity, bytes = ANYONE_FIELDS_PDF) => {
    const docId = `anyone-fields-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    const token = signDevToken(fixture().secret, {
      sub: `anyone-fields-user-${++users}`,
      tenant_id: TENANT_ID,
      doc_id: docId,
      scope: [...scope],
      ...(Object.keys(identity).length > 0 ? { extras: { identity } } : {}),
    });
    return engine.open({ kind: 'token', token });
  },
  sign: async (doc, signing) => {
    await sign(doc, { ...signing, key: signer! });
  },
});
