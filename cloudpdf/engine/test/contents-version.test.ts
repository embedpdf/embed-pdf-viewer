import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { encodeSearchToken, tokenPinOf, type EngineValues } from '@embedpdf/engine-core/wire';
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
  'flatten_selective.pdf',
);
const TENANT_ID = 'cloud-contents-version-tenant';
const DOC_ID = 'contents-version-cloud';

let fx: DbSeededFixture | undefined;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-contents-version-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, DOC_ID, fixturePath, 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

const get = (path: string) =>
  fetch(`${fx!.baseUrl}/v1/docs/${DOC_ID}/layers/default/${path}`, {
    headers: { authorization: `Bearer ${docScopedToken(fx!, TENANT_ID, DOC_ID)}` },
  });

/** The layer manifest's `contentsVersion`, read live. */
async function contentsVersion(): Promise<number> {
  const response = await get('manifest');
  expect(response.status).toBe(200);
  return ((await response.json()) as { contentsVersion: number }).contentsVersion;
}

/** A search URL at the layer's current contents and layout pins. */
async function searchAtCurrentPins(): Promise<string> {
  const head = (await (await get('head')).json()) as { engine: EngineValues };
  const manifest = (await (await get('manifest')).json()) as {
    contentsVersion: number;
    layoutVersion: number;
  };
  return `search/rects/data@${encodeSearchToken({
    contentsVersion: manifest.contentsVersion,
    layoutVersion: manifest.layoutVersion,
    query: { text: 'a' },
    skip: 0,
    pin: tokenPinOf('search', head.engine),
  })}`;
}

/**
 * `contentsVersion` is the manifest's pin for a read across every page's
 * content (search). An annotation write leaves it; a write that moves a
 * page's content moves it, and its cache delta says so.
 */
describe('contentsVersion', () => {
  test('stays with an annotation write and moves with a flatten', async () => {
    const engine = cloudEngine({ baseUrl: fx!.baseUrl, token: tenantToken(fx!, TENANT_ID) });
    const doc = await engine.open({ kind: 'id', id: DOC_ID });
    try {
      const first = (await doc.pages.list()).pages[0]!.ref;
      const before = await contentsVersion();
      const search = await searchAtCurrentPins();
      expect((await get(search)).status).toBe(200);

      await doc.page(first).annotations.create({
        subtype: 'square',
        box: { x: 20, y: 20, width: 40, height: 40 },
        color: '#1428dc',
        strokeWidth: 2,
      });
      expect(await contentsVersion()).toBe(before);
      // A search pinned before the annotation write still reads current text.
      expect((await get(search)).status).toBe(200);

      const flattened = await doc.pages.flatten!([toPageRef(first.objectNumber)], {
        usage: 'display',
      });
      expect(flattened.meta.cacheDelta?.contentsVersion).toBe(before + 1);
      expect(await contentsVersion()).toBe(before + 1);
      // After the flatten, the search pinned before it is no longer current.
      expect((await get(search)).status).toBe(404);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  });
});
