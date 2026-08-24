/**
 * Tile stitching ground truth — the engine's rect-target renders must
 * REGISTER: a tile equals the same region of a wider render, adjacent
 * tiles butt seamlessly, and bled (overlapping) tiles agree bit-for-bit in
 * their overlap. This is the contract the render plugin's tile plane
 * composites on; if it drifts, on-screen seams follow. Mock-free: real
 * wasm PDFium over a real document.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DocumentHandle, PageRaster } from '@embedpdf/engine-core/runtime';
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
let pageW = 0;
let pageH = 0;

beforeAll(async () => {
  const bytes = new Uint8Array(await readFile(pdfPath));
  engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
  doc = await engine.open({ kind: 'bytes', id: 'stitch-doc', bytes });
  const pages = (await doc.pages.list()).pages;
  pon = pages[0]!.pageObjectNumber;
  pageW = pages[0]!.size.width;
  pageH = pages[0]!.size.height;
}, 60_000);

afterAll(async () => {
  await doc?.close();
  await engine?.destroy();
});

/** y-down page-point rect → y-up engine rect. */
const eng = (x: number, y: number, w: number, h: number) => ({
  left: x,
  right: x + w,
  top: pageH - y,
  bottom: pageH - (y + h),
});

const raw = (rect: ReturnType<typeof eng>, scale: number): Promise<PageRaster> =>
  doc.page(pon).render.raw({ target: { kind: 'rect', rect }, viewport: { kind: 'scale', scale } });

/** Max |RGB diff| over an aligned sub-rectangle of two rasters. */
function maxDiff(
  a: PageRaster,
  ax: number,
  ay: number,
  b: PageRaster,
  bx: number,
  by: number,
  w: number,
  h: number,
): number {
  const da = new Uint8Array(a.data);
  const db = new Uint8Array(b.data);
  let max = 0;
  for (let y = 0; y < h; y++) {
    const ra = (ay + y) * a.stride + ax * 4;
    const rb = (by + y) * b.stride + bx * 4;
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(da[ra + x * 4 + c]! - db[rb + x * 4 + c]!);
        if (d > max) max = d;
      }
    }
  }
  return max;
}

describe('tile stitching (wasm engine, real document)', () => {
  test('tiles register against the union, each other, and their bled overlaps', async () => {
    // A deep-zoom-like level over a mid-page grid cell (content-bearing on
    // the ebook cover). One device px of bleed, like the plugin's default.
    const want = 5000;
    const s = want / pageW;
    const span = 512 / s;
    const bleedPt = 1 / s;
    const ix = 3;
    const iy = 2;
    const x0 = ix * span;
    const y0 = iy * span;

    const tileA = await raw(eng(x0, y0, span, span), s);
    const tileB = await raw(eng(x0 + span, y0, span, span), s);
    const tileC = await raw(eng(x0, y0 + span, span, span), s);
    const unionH = await raw(eng(x0, y0, 2 * span, span), s);
    const unionV = await raw(eng(x0, y0, span, 2 * span), s);
    const bledA = await raw(eng(x0 - bleedPt, y0 - bleedPt, span + 2 * bleedPt, span + 2 * bleedPt), s);
    const bledB = await raw(
      eng(x0 + span - bleedPt, y0 - bleedPt, span + 2 * bleedPt, span + 2 * bleedPt),
      s,
    );

    expect(tileA.width).toBe(512);
    expect(unionH.width).toBe(1024);
    expect(bledA.width).toBe(514);

    // A tile IS the same region of a wider render (both axes).
    expect(maxDiff(tileA, 0, 0, unionH, 0, 0, 512, 512)).toBeLessThanOrEqual(1);
    expect(maxDiff(tileB, 0, 0, unionH, 512, 0, 512, 512)).toBeLessThanOrEqual(1);
    expect(maxDiff(tileC, 0, 0, unionV, 0, 512, 512, 512)).toBeLessThanOrEqual(1);

    // A bled tile's interior matches the union shifted by the bleed…
    expect(maxDiff(bledA, 1, 1, unionH, 0, 0, 512, 512)).toBeLessThanOrEqual(1);
    // …and the 2-device-px overlap of two bled neighbors agrees bit-for-bit:
    // bledA col k covers page x0 − 1px + k; bledB col k covers x0 + 511px + k
    // ⇒ bledA cols [512, 514) ≡ bledB cols [0, 2).
    expect(maxDiff(bledA, 512, 0, bledB, 0, 0, 2, 514)).toBeLessThanOrEqual(1);
  }, 120_000);
});
