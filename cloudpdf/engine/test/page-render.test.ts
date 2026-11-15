import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CROP_OFFSET_PDF,
  runPageRenderConformance,
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
const TENANT_ID = 'cloud-page-render-conformance-tenant';
const DOC_ID = 'crop-offset-render-cloud';

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-page-render-conformance-secret' });
  fixtureDir = await mkdtemp(join(tmpdir(), 'page-render-'));
  const fixturePath = join(fixtureDir, 'crop-offset.pdf');
  await writeFile(fixturePath, CROP_OFFSET_PDF);
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

runPageRenderConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
  },
  open: (engine) => engine.open({ kind: 'id', id: DOC_ID }),
});

describe('pageColors on the cloud engine', () => {
  test('a page in other colors is refused: the server draws pages as the file has them', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const engine = cloudEngine({ baseUrl: fx.baseUrl, token: tenantToken(fx, TENANT_ID) });
    try {
      const doc = await engine.open({ kind: 'id', id: DOC_ID });
      const { pages } = await doc.pages.list();
      const page = doc.page(pages[0]!.ref);
      for (const pageColors of ['dark', 'sepia', { background: '#000000' }] as const) {
        await expect(page.render.image({ pageColors })).rejects.toMatchObject({
          code: 'NotImplemented',
        });
      }
      // A color that is not one is the caller's mistake, as on the local engine.
      await expect(page.render.image({ pageColors: { text: 'red' } })).rejects.toMatchObject({
        code: 'InvalidArg',
      });
      // The page as the file has it is what the server draws.
      const image = await page.render.image({ pageColors: 'normal', format: 'png' });
      expect(image.width).toBeGreaterThan(0);
    } finally {
      await engine.destroy();
    }
  });

  test('raw pixels inside the server are refused in other colors too, before the server is asked', async () => {
    if (!fx) throw new Error('fixture not initialised');
    const asked: unknown[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken(fx, TENANT_ID),
      renderRaw: (_page, options) => {
        asked.push(options);
        return Promise.reject(new Error('not drawn in this test'));
      },
    });
    try {
      const doc = await engine.open({ kind: 'id', id: DOC_ID });
      const { pages } = await doc.pages.list();
      const page = doc.page(pages[0]!.ref);
      await expect(page.render.raw({ pageColors: 'dark' })).rejects.toMatchObject({
        code: 'NotImplemented',
      });
      expect(asked).toEqual([]);
      await expect(page.render.raw({ pageColors: 'normal' })).rejects.toThrow(
        'not drawn in this test',
      );
      expect(asked).toHaveLength(1);
    } finally {
      await engine.destroy();
    }
  });
});
