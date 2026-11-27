import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  PICTURE_BUTTON_PDF,
  runPictureButtonConformance,
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
 * A push button's picture and a widget's layout on the cloud engine, against
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

const TENANT_ID = 'cloud-picture-button-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;
let users = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-picture-button-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runPictureButtonConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, scope, identity, bytes = PICTURE_BUTTON_PDF) => {
    const docId = `picture-button-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, bytes);
    const token = signDevToken(fixture().secret, {
      sub: `picture-button-user-${++users}`,
      tenant_id: TENANT_ID,
      doc_id: docId,
      scope: [...scope],
      ...(Object.keys(identity).length > 0 ? { extras: { identity } } : {}),
    });
    return engine.open({ kind: 'token', token });
  },
  // The server judges a completion's CMS, so a placeholder doesn't complete.
  completesSignings: false,
});
