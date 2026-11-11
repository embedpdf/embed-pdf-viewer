import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_BUNDLE_LIMITS, toPageRef, type BundleLimits } from '@embedpdf/engine-core/runtime';
import {
  runFormCopyConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { cloudEngine } from '../src/index';
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
};

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-form-copy-conformance-tenant';
let opened = 0;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-form-copy-conformance-secret' });
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

function fixture(): DbSeededFixture {
  if (!fx) throw new Error('fixture not initialised');
  return fx;
}

runFormCopyConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () =>
    cloudEngine({ baseUrl: fixture().baseUrl, token: tenantToken(fixture(), TENANT_ID) }),
  // Each test opens its own copy: the tests write to their documents.
  open: async (engine, name) => {
    const id = `${name}-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures[name as 'authoring'], 1);
    return engine.open({ kind: 'id', id });
  },
  openScoped: async (engine, name, scope) => {
    const id = `${name}-${++opened}`;
    await seedDocumentFromBytes(fixture(), TENANT_ID, id, fixtures[name as 'authoring'], 1);
    return engine.open({ kind: 'token', token: docScopedToken(fixture(), TENANT_ID, id, scope) });
  },
});

describe('the server holds a form copy to its bundle limits', () => {
  const limits: BundleLimits = { ...DEFAULT_BUNDLE_LIMITS, items: 2 };
  let small: DbSeededFixture | undefined;

  beforeAll(async () => {
    small = await buildDbSeededFixture({
      secret: 'cloud-form-copy-limits-secret',
      bundleLimits: limits,
    });
  });

  afterAll(async () => {
    await teardownDbSeededFixture(small);
  });

  test('refuses more fields than its item limit, and writes nothing', async () => {
    if (!small) throw new Error('fixture not initialised');
    const engine = cloudEngine({ baseUrl: small.baseUrl, token: tenantToken(small, TENANT_ID) });
    const id = `form-copy-limits-${++opened}`;
    await seedDocumentFromBytes(small, TENANT_ID, id, fixtures.authoring, 1);
    const doc = await engine.open({ kind: 'id', id });
    try {
      const { pages } = await doc.pages.list();
      const page = toPageRef(pages[0]!.ref.objectNumber);
      const { field } = await doc.forms.create({
        kind: 'text',
        name: 'city',
        widgets: [{ page, rect: { x: 40, y: 100, width: 120, height: 20 } }],
      });
      const before = await doc.forms.list();

      await expect(doc.forms.copy([field.ref, field.ref, field.ref])).rejects.toMatchObject({
        code: 'PayloadTooLarge',
        details: { limit: 'items', max: 2, value: 3 },
      });
      expect(await doc.forms.list()).toEqual(before);

      // Within it.
      const copied = await doc.forms.copy([field.ref, field.ref]);
      expect(copied.fields.map((copy) => copy.name)).toEqual(['city_2', 'city_3']);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
