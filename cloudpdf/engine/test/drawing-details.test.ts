import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  DRAWING_FIXTURE_PDF,
  runDrawingDetailsConformance,
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
const acrobatFreeText = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'freetext-rotated-acrobat.pdf',
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
let drawingPath: string | undefined;
const TENANT_ID = 'cloud-drawing-details-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-drawing-details-conformance-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'drawing-'));
  drawingPath = join(fixtureDir, 'drawing.pdf');
  await writeFile(drawingPath, DRAWING_FIXTURE_PDF);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runDrawingDetailsConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  // Each test opens its own copy: the tests write to their documents.
  open: async (engine, fixture) => {
    if (!fx || !drawingPath) throw new Error('fixture not initialised');
    const id = `${fixture}-${++opened}`;
    await seedDocumentFromBytes(
      fx,
      TENANT_ID,
      id,
      fixture === 'drawing' ? drawingPath : acrobatFreeText,
      1,
    );
    return engine.open({ kind: 'id', id });
  },
});
