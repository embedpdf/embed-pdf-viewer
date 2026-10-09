import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  COLOR_FIXTURE_PDF,
  runColorConformance,
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
const TENANT_ID = 'cloud-color-conformance-tenant';
/** One copy per test: a cloud document keeps its edits. */
const COPIES = 3;
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-color-conformance-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'color-'));
  const path = join(fixtureDir, 'color.pdf');
  await writeFile(path, COLOR_FIXTURE_PDF);
  for (let copy = 0; copy < COPIES; copy++) {
    await seedDocumentFromBytes(fx, TENANT_ID, `color-${copy}`, path, 1);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runColorConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  open: (engine) => engine.open({ kind: 'id', id: `color-${opened++}` }),
});
