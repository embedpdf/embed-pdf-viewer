import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  APPEARANCE_STATES_FIXTURE_PDF,
  runAppearanceStatesConformance,
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
const TENANT_ID = 'cloud-appearance-states-tenant';
/** The suite only reads, so one copy serves every test. */
const COPIES = 1;
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-appearance-states-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'appearance-states-'));
  const path = join(fixtureDir, 'appearance-states.pdf');
  await writeFile(path, APPEARANCE_STATES_FIXTURE_PDF);
  for (let copy = 0; copy < COPIES; copy++) {
    await seedDocumentFromBytes(fx, TENANT_ID, `appearance-states-${copy}`, path, 1);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runAppearanceStatesConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  open: (engine) => engine.open({ kind: 'id', id: `appearance-states-${opened++}` }),
});
