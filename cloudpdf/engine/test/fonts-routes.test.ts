import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import { toPageRef, type DocumentManifest, type FontList } from '@embedpdf/engine-core/runtime';
import { renderImageOptionsToWire, wirePaths } from '@embedpdf/engine-core/wire';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocument,
  teardownDbSeededFixture,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

/**
 * The server's font routes as HTTP sees them: how each caches, what a font
 * the server keeps to itself allows, who may have a program's bytes, and the
 * server's fonts' fingerprint in the list's and every picture's URL.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../../packages/engine/main/test/fixtures');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const TENANT_ID = 'cloud-font-routes-tenant';
const DOC_ID = 'font-routes';
const OTHER_FONTS = '0123456789abcdef';

let fx: DbSeededFixture;
let fontDir: string;
let served: string;
let kept: string;

/** Roboto with another `head.fontRevision`: the same glyphs, another program. */
function anotherRevision(font: Uint8Array): Uint8Array {
  const copy = font.slice();
  const view = new DataView(copy.buffer);
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + i * 16;
    if (String.fromCharCode(...copy.slice(record, record + 4)) === 'head') {
      const offset = view.getUint32(record + 8);
      view.setUint32(offset + 4, view.getUint32(offset + 4) + 1);
    }
  }
  return copy;
}

beforeAll(async () => {
  const roboto = new Uint8Array(await readFile(resolve(fixtures, 'Roboto-Regular.ttf')));
  const revised = anotherRevision(roboto);
  fontDir = await mkdtemp(join(tmpdir(), 'cloud-font-routes-'));
  await writeFile(join(fontDir, 'revised.ttf'), revised);
  served = sha256(roboto);
  kept = sha256(revised);
  fx = await buildDbSeededFixture({
    secret: 'cloud-font-routes-secret',
    fonts: [
      { key: 'roboto', path: resolve(fixtures, 'Roboto-Regular.ttf'), serve: true },
      { key: 'roboto-kept', path: join(fontDir, 'revised.ttf'), fallback: false },
    ],
  });
  await seedDocument(
    fx,
    TENANT_ID,
    DOC_ID,
    new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf'))),
  );
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
  await rm(fontDir, { recursive: true, force: true });
});

const writer = () => docScopedToken(fx, TENANT_ID, DOC_ID);
const reader = () =>
  signDevToken(fx.secret, {
    sub: 'cloud-test-reader',
    tenant_id: TENANT_ID,
    doc_id: DOC_ID,
    scope: ['doc.open', 'doc.render'],
  });

const get = (path: string, token: string) =>
  fetch(`${fx.baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });

async function manifest(): Promise<DocumentManifest> {
  const head = (await (await get(wirePaths.layerHead(DOC_ID, 'default'), writer())).json()) as {
    docVersion: number;
  };
  const response = await get(wirePaths.layerManifest(DOC_ID, 'default', head.docVersion), writer());
  return (await response.json()) as DocumentManifest;
}

describe('the server’s font routes', () => {
  test('the list caches like every pinned read; another server’s fonts are not this list', async () => {
    const current = await manifest();
    expect(current.serverFonts).toMatch(/^[0-9a-f]{16}$/);
    const token = { fontsVersion: current.fontsVersion, serverFonts: current.serverFonts };
    const list = await get(wirePaths.layerFonts(DOC_ID, 'default', token), writer());
    expect(list.status).toBe(200);
    // No CDN in front of this server: only the caller's browser may keep it.
    expect(list.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');

    const elsewhere = await get(
      wirePaths.layerFonts(DOC_ID, 'default', { ...token, serverFonts: OTHER_FONTS }),
      writer(),
    );
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.headers.get('cache-control')).toBe('private, no-store');
  });

  test('a font the server keeps to itself is listed and written with, never sent', async () => {
    const current = await manifest();
    const list = (await (
      await get(
        wirePaths.layerFonts(DOC_ID, 'default', {
          fontsVersion: current.fontsVersion,
          serverFonts: current.serverFonts,
        }),
        writer(),
      )
    ).json()) as FontList;
    const font = list.fonts.find((candidate) => candidate.name === 'roboto-kept')!;
    expect(font).toMatchObject({ source: 'engine', canChoose: true, restrictions: ['not-served'] });
    expect(font.programs[0]).toMatchObject({ displayHash: kept, canDownload: false });

    const refused = await get(wirePaths.layerFontProgramFile(DOC_ID, 'default', kept), writer());
    expect(refused.status).toBe(400);
    expect((await get(wirePaths.fontProgramFile(kept), writer())).status).toBe(404);
  });

  test('a program’s bytes are kept by the browser alone, and go to a token that may write text', async () => {
    for (const path of [
      wirePaths.layerFontProgramFile(DOC_ID, 'default', served),
      wirePaths.fontProgramFile(served),
    ]) {
      const response = await get(path, writer());
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
      expect(sha256(new Uint8Array(await response.arrayBuffer()))).toBe(served);

      const refused = await get(path, reader());
      expect(refused.status).toBe(403);
      const body = (await refused.json()) as { error: { details?: { anyOf?: string[] } } };
      expect(body.error.details?.anyOf).toContain('doc.annotate.modify');
    }
  });

  test('a picture drawn with other server fonts is not this server’s', async () => {
    const current = await manifest();
    const page = current.pages[0]!;
    const picture = (serverFonts: string) =>
      wirePaths.layerPageRender(
        DOC_ID,
        'default',
        'pages',
        toPageRef(page.page.objectNumber),
        renderImageOptionsToWire(
          { format: 'webp', viewport: { kind: 'width', width: 64 } },
          { contentVersion: page.cache.contentVersion, serverFonts },
        ),
      );
    expect((await get(picture(current.serverFonts), writer())).status).toBe(200);
    const elsewhere = await get(picture(OTHER_FONTS), writer());
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.headers.get('cache-control')).toBe('private, no-store');
  });
});
