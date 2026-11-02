import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CHANGE_FIXTURE_PDF,
  runPageCopyConformance,
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
const TENANT_ID = 'cloud-page-copy-tenant';
/** One document per test: a cloud document keeps its writes across opens. */
const DOCUMENTS = 4;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-page-copy-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'page-copy-'));
  const path = join(fixtureDir, 'copy.pdf');
  await writeFile(path, CHANGE_FIXTURE_PDF);
  for (let at = 1; at <= DOCUMENTS; at++) {
    await seedDocumentFromBytes(fx, TENANT_ID, `page-copy-${at}`, path, 2);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runPageCopyConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  open: (engine, id) => engine.open({ kind: 'id', id }),
});
