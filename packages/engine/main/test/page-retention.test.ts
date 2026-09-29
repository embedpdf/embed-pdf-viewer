/**
 * Pages the engine keeps loaded between jobs, and the image decodes it keeps
 * between them, render exactly as freshly loaded pages do. Each render on one
 * open document is compared with the same render in an engine that opened the
 * document for that render alone. The fixture's JPEG 2000 image decodes at a
 * resolution that depends on the render size and is cached on the page, so a
 * page that carried its image cache from one job to the next would render
 * differently, and a kept decode must only serve renders at its resolution.
 * Mock-free: real wasm runtime.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import type { LocalDocumentHandle, PageRaster, PageRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'fixtures', 'jpx_resolution_levels.pdf');
const WIDTHS = [1600, 640, 3000, 150, 640];

let bytes: Uint8Array;

beforeAll(async () => {
  bytes = new Uint8Array(await readFile(fixturePath));
});

const digest = (raster: PageRaster) =>
  createHash('sha256').update(new Uint8Array(raster.data)).digest('hex');

async function withDocument<T>(
  id: string,
  run: (doc: LocalDocumentHandle, page: PageRef) => Promise<T>,
): Promise<T> {
  const engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
  try {
    const doc = await engine.open({ kind: 'bytes', id, bytes });
    try {
      const page = toPageRef((await doc.pages.list()).pages[0]!.ref.pageObjectNumber);
      return await run(doc, page);
    } finally {
      await doc.close();
    }
  } finally {
    await engine.destroy();
  }
}

const renderAt = (doc: LocalDocumentHandle, page: PageRef, width: number) =>
  doc
    .page(page)
    .render.raw({ viewport: { kind: 'width', width } })
    .then(digest);

const appearancesAt = async (doc: LocalDocumentHandle, page: PageRef, scale: number) => {
  const result = await doc
    .page(page)
    .annotations.renderAppearancesRaw({ viewport: { kind: 'scale', scale } });
  return result.appearances.map((appearance) => digest(appearance.raster));
};

describe('pages kept between jobs (wasm engine)', () => {
  test('render the same bytes as a freshly loaded page, whatever rendered before', async () => {
    const kept = await withDocument('retention-kept', async (doc, page) => {
      const digests: string[] = [];
      for (const width of WIDTHS) digests.push(await renderAt(doc, page, width));
      return digests;
    });
    const fresh: string[] = [];
    for (const [i, width] of WIDTHS.entries()) {
      fresh.push(
        await withDocument(`retention-fresh-${i}`, (doc, page) => renderAt(doc, page, width)),
      );
    }
    expect(new Set(fresh).size).toBeGreaterThan(1);
    expect(kept).toEqual(fresh);
  }, 120_000);

  test('render annotation appearances as a fresh document does after a page render', async () => {
    const kept = await withDocument('retention-appearances', async (doc, page) => {
      await renderAt(doc, page, 3000);
      return appearancesAt(doc, page, 0.5);
    });
    const fresh = await withDocument('retention-appearances-fresh', (doc, page) =>
      appearancesAt(doc, page, 0.5),
    );
    expect(kept).toHaveLength(2);
    expect(kept).toEqual(fresh);
  }, 120_000);

  test('show an image a redaction changed exactly as a document that never rendered it', async () => {
    const redact = async (doc: LocalDocumentHandle, page: PageRef) => {
      await doc.page(page).annotations.create({
        subtype: 'redact',
        rect: { x: 100, y: 100, width: 100, height: 100 },
        interiorColor: '#000000',
      });
      await doc.redaction!.apply({ pages: [page] });
    };
    const [before, kept] = await withDocument('retention-redact', async (doc, page) => {
      const digest = await renderAt(doc, page, 640);
      await redact(doc, page);
      return [digest, await renderAt(doc, page, 640)];
    });
    const fresh = await withDocument('retention-redact-fresh', async (doc, page) => {
      await redact(doc, page);
      return renderAt(doc, page, 640);
    });
    expect(kept).not.toEqual(before);
    expect(kept).toEqual(fresh);
  }, 120_000);

  test('show a change to the page exactly as a document that made it without a kept page', async () => {
    const kept = await withDocument('retention-flatten', async (doc, page) => {
      await renderAt(doc, page, 640);
      await doc.pages.flatten([page], { usage: 'display' });
      return renderAt(doc, page, 640);
    });
    const fresh = await withDocument('retention-flatten-fresh', async (doc, page) => {
      await doc.pages.flatten([page], { usage: 'display' });
      return renderAt(doc, page, 640);
    });
    expect(kept).toEqual(fresh);
  }, 120_000);
});
