import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import {
  CHANGE_FIXTURE_PDF,
  runPermissionConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import type { Engine } from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * The read families through three tokens on the cloud engine, against
 * `@cloudpdf/server` on the native runtime, with another session on the same
 * document for the events.
 */

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const TENANT_ID = 'cloud-permission-conformance-tenant';
let fx: DbSeededFixture | undefined;
let docs = 0;
let sessions = 0;
/** The engines of the other sessions, one per user, destroyed at the end. */
const others: Engine[] = [];

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-permission-conformance-secret' });
});

afterAll(async () => {
  await Promise.all(others.map((engine) => engine.destroy()));
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

function tokenFor(docId: string, scope: readonly string[]): string {
  return signDevToken(fixture().secret, {
    sub: `permission-session-${++sessions}`,
    tenant_id: TENANT_ID,
    doc_id: docId,
    scope: [...scope],
  });
}

runPermissionConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => cloudEngine({ baseUrl: fixture().baseUrl }),
  open: async (engine, scope) => {
    const docId = `permissions-${++docs}`;
    await seedDocument(fixture(), TENANT_ID, docId, CHANGE_FIXTURE_PDF);
    return engine.open({ kind: 'token', token: tokenFor(docId, scope) });
  },
  openSameDocument: (doc, scope) => {
    const engine = cloudEngine({ baseUrl: fixture().baseUrl });
    others.push(engine);
    return engine.open({ kind: 'token', token: tokenFor(doc.id, scope) });
  },
});
