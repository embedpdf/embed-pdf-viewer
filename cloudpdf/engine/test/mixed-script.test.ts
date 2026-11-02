/**
 * Mixed-script text on the cloud engine: the server's workers carry the same
 * default fallback fonts as the local engine.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  BARE_PAGE_FIXTURE_PDF,
  runMixedScriptConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};
let fx: DbSeededFixture | undefined;
let fixtureDir: string | undefined;
const TENANT_ID = 'cloud-mixed-script-conformance-tenant';
const DOC_ID = 'mixed-script-cloud';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-mixed-script-conformance-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'mixed-script-'));
  const barePagePath = join(fixtureDir, 'bare-page.pdf');
  await writeFile(barePagePath, BARE_PAGE_FIXTURE_PDF);
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, barePagePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runMixedScriptConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: { id: DOC_ID, bytes: async () => new Uint8Array(), expected: {} },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
});
