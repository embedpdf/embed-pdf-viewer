import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAnnotationExportConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const localFixtures = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
);
const fixtures = {
  authoring: resolve(localFixtures, 'hello_world.pdf'),
  'acrobat-stamps': resolve(localFixtures, 'stamp-opacity-acrobat.pdf'),
  'acrobat-rewrapped': resolve(localFixtures, 'stamp-rewrapped-acrobat.pdf'),
  'acrobat-roundtrip-60': resolve(localFixtures, 'stamp-roundtrip-acrobat-60.pdf'),
  'acrobat-roundtrip-100': resolve(localFixtures, 'stamp-roundtrip-acrobat-100.pdf'),
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-annotation-export-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-annotation-export-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

runAnnotationExportConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  // Each test opens its own copy: the tests write to their document.
  open: async (engine, fixture) => {
    if (!fx) throw new Error('fixture not initialised');
    const id = `${fixture}-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, id, fixtures[fixture], 1);
    return engine.open({ kind: 'id', id });
  },
  rawAppearances: false,
});

describe('annotation export on the cloud engine', () => {
  test('needs doc.download, as reading a resource does', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const id = `scoped-${++opened}`;
    await seedDocumentFromBytes(fx, TENANT_ID, id, fixtures['acrobat-stamps'], 1);
    const engine = createCloudEngine({
      baseUrl: fx.baseUrl,
      token: docScopedToken(fx, TENANT_ID, id, ['doc.open', 'doc.annotate.read']),
    });
    try {
      const doc = await engine.open({ kind: 'id', id });
      await expect(doc.annotations.export()).rejects.toMatchObject({ code: 'Forbidden' });
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});
