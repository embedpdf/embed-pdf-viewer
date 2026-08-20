/**
 * Appearance pixel-clamp red line: rendering a page's annotation
 * appearances at an absurd deep-zoom scale must stay BOUNDED — every
 * raster within the per-appearance ceiling, the whole batch resolving —
 * instead of a page-sized annotation asking the wasm heap for gigabytes
 * (the observed failure: ~600pt stamp × scale ~47 → 3.3 GB malloc → OOM).
 * The clamp reduces that appearance's effective scale; it still renders
 * and still covers its rect.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';
import { createLocalEngine, type LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'ebook-annotated.pdf',
);

let engine: LocalEngine;
let doc: DocumentHandle;
let pon: number;

beforeAll(async () => {
  const bytes = new Uint8Array(await readFile(pdfPath));
  engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
  doc = await engine.open({ kind: 'bytes', id: 'clamp-doc', bytes });
  pon = (await doc.pages.list()).pages[0]!.pageObjectNumber;
}, 60_000);

afterAll(async () => {
  await doc?.close();
  await engine?.destroy();
});

describe('appearance pixel clamp (wasm engine, real document)', () => {
  test('a deep-zoom appearance batch stays bounded and complete', async () => {
    // Scale ~50 is the territory that OOM'd before the clamp. Raw rasters —
    // node has no canvas encoder, and pixels are what the clamp bounds.
    const result = await doc.page(pon).annotations.renderAppearances({ scale: 50 });
    expect(result.appearances.length).toBeGreaterThan(0);
    for (const ap of result.appearances) {
      expect(ap.raster.width).toBeGreaterThan(0);
      expect(ap.raster.height).toBeGreaterThan(0);
      // The red line: no raster past the per-appearance ceiling (+ rounding slack).
      expect(ap.raster.width * ap.raster.height).toBeLessThanOrEqual(16_000_000 * 1.02);
    }
    // Small annotations must NOT be over-clamped: at scale 50 at least one
    // appearance should render meaningfully sharper than the page-sized
    // stamp's capped scale (~5.7) would allow relative to its rect.
    const sharp = result.appearances.some((ap) => {
      const rectW = ap.rect.right - ap.rect.left;
      return rectW > 0 && ap.raster.width / rectW > 20;
    });
    expect(sharp).toBe(true);
  }, 120_000);
});
