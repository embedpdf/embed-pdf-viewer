import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  PAGE_SPACE_FIXTURES,
  runPageSpaceConformance,
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
const TENANT_ID = 'cloud-page-space-conformance-tenant';
const docId = (name: string) => `page-space-${name}`;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-page-space-conformance-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'page-space-'));
  for (const fixture of PAGE_SPACE_FIXTURES) {
    const path = join(fixtureDir, `${fixture.name}.pdf`);
    await writeFile(path, fixture.bytes);
    await seedDocumentFromBytes(fx, TENANT_ID, docId(fixture.name), path, fixture.pages.length);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runPageSpaceConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  open: (engine, fixture) => engine.open({ kind: 'id', id: docId(fixture.name) }),
});
