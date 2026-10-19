import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  BARE_PAGE_FIXTURE_PDF,
  runRedactionApplyConformance,
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

const here = dirname(fileURLToPath(import.meta.url));
// Vendored corpus fixture — see packages/engine/main/test/fixtures/README.md.
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'hello_world.pdf',
);
const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};
let fx: DbSeededFixture | undefined;
let fixtureDir: string | undefined;
const TENANT_ID = 'cloud-redaction-conformance-tenant';
const DOC_ID = 'redaction-apply-cloud';
const BARE_PAGE_DOC_ID = 'redaction-apply-bare-page-cloud';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-redaction-conformance-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
  fixtureDir = await mkdtemp(join(tmpdir(), 'redaction-'));
  const barePagePath = join(fixtureDir, 'bare-page.pdf');
  await writeFile(barePagePath, BARE_PAGE_FIXTURE_PDF);
  await seedDocumentFromBytes(fx, TENANT_ID, BARE_PAGE_DOC_ID, barePagePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runRedactionApplyConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixture: { id: DOC_ID, bytes: async () => new Uint8Array(), expected: {} },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  openBarePage: (engine) => engine.open({ kind: 'id', id: BARE_PAGE_DOC_ID }),
});
