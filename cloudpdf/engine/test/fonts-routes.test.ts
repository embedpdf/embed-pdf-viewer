import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signDevToken } from '@cloudpdf/server';
import { toPageRef, type DocumentManifest, type FontList } from '@embedpdf/engine-core/runtime';
import {
  renderImageOptionsToWire,
  SHAPES,
  tokenPinOf,
  wirePaths,
  type EngineValues,
} from '@embedpdf/engine-core/wire';
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
/** An engine value another server could have. */
const OTHER_ENGINE = '0123456789ab';

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

/** The manifest, and the engine values of the `/head` it was read after. */
async function manifest(): Promise<DocumentManifest & { engine: EngineValues }> {
  const head = (await (await get(wirePaths.layerHead(DOC_ID, 'default'), writer())).json()) as {
    docVersion: number;
    engine: EngineValues;
  };
  const response = await get(
    wirePaths.layerManifest(
      DOC_ID,
      'default',
      head.docVersion,
      tokenPinOf('manifest', head.engine),
    ),
    writer(),
  );
  return { ...((await response.json()) as DocumentManifest), engine: head.engine };
}

describe('the server’s font routes', () => {
  test('the list caches like every pinned read; one for another server’s fonts is answered uncached', async () => {
    const current = await manifest();
    const token = { fontsVersion: current.fontsVersion, pin: tokenPinOf('fonts', current.engine) };
    const list = await get(wirePaths.layerFonts(DOC_ID, 'default', token), writer());
    expect(list.status).toBe(200);
    // No CDN in front of this server: only the caller's browser may keep it.
    expect(list.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');

    const elsewhere = await get(
      wirePaths.layerFonts(DOC_ID, 'default', {
        ...token,
        pin: { ...token.pin, engine: OTHER_ENGINE },
      }),
      writer(),
    );
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.headers.get('cache-control')).toBe('private, no-store');
    expect(elsewhere.headers.get('embedpdf-engine')).toBe(current.engine.fonts);
  });

  test('a font the server keeps to itself is listed and written with, never sent', async () => {
    const current = await manifest();
    const list = (await (
      await get(
        wirePaths.layerFonts(DOC_ID, 'default', {
          fontsVersion: current.fontsVersion,
          pin: tokenPinOf('fonts', current.engine),
        }),
        writer(),
      )
    ).json()) as FontList;
    const font = list.fonts.find((candidate) => candidate.name === 'roboto-kept')!;
    expect(font).toMatchObject({ source: 'engine', canChoose: true, restrictions: ['not-served'] });
    expect(font.programs[0]).toMatchObject({ displaySha256: kept, canDownload: false });

    const refused = await get(wirePaths.layerFontProgramFile(DOC_ID, 'default', kept), writer());
    expect(refused.status).toBe(400);
    expect((await get(wirePaths.fontProgramFile(kept), writer())).status).toBe(404);
  });

  test('the operator’s fonts are the server’s own, its default fallback fonts are built in', async () => {
    const current = await manifest();
    const list = (await (
      await get(
        wirePaths.layerFonts(DOC_ID, 'default', {
          fontsVersion: current.fontsVersion,
          pin: tokenPinOf('fonts', current.engine),
        }),
        writer(),
      )
    ).json()) as FontList;
    const builtIn = (name: string) => list.fonts.find((font) => font.name === name)?.builtIn;
    // `roboto` fills in characters too (a configured font does by default).
    expect(list.fallbacks).toContain('roboto');
    expect(builtIn('roboto')).toBe(false);
    expect(builtIn('roboto-kept')).toBe(false);
    expect(builtIn('noto-sans-hebrew')).toBe(true);
    expect(builtIn('helvetica')).toBe(true);
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

  test('a picture for another server’s fonts is drawn with this one’s, uncached', async () => {
    const current = await manifest();
    const page = current.pages[0]!;
    const picture = (engine: string) =>
      wirePaths.layerPageRender(
        DOC_ID,
        'default',
        'pages',
        toPageRef(page.page.objectNumber),
        renderImageOptionsToWire(
          { format: 'webp', viewport: { kind: 'width', width: 64 } },
          { contentVersion: page.cache.contentVersion, pin: { engine, shape: SHAPES.render } },
        ),
      );
    const own = await get(picture(current.engine.render!), writer());
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    const elsewhere = await get(picture(OTHER_ENGINE), writer());
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.headers.get('cache-control')).toBe('private, no-store');
    expect(elsewhere.headers.get('embedpdf-engine')).toBe(current.engine.render);
  });
});
