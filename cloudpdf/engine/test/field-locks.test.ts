import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import { createTestSigner, sign, type SignerPort } from '@embedpdf/core-signature';
import {
  runFieldLocksConformance,
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
 * Field locks on the cloud engine, against `@cloudpdf/server` on the native
 * runtime, signed with a test certificate since the server judges a
 * completion's CMS.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-field-locks-tenant';
let fx: DbSeededFixture | undefined;
let signer: SignerPort | undefined;
let docs = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-field-locks-secret' });
  signer = await createTestSigner({ commonName: 'Field Locks Signer' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runFieldLocksConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, scope, identity, bytes) => {
    const docId = `field-locks-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    const token = signDevToken(fixture().secret, {
      sub: `field-locks-user-${docs}`,
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
