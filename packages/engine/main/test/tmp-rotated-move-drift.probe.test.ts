/**
 * Temporary probe — reproduces the user-reported "rotated circle shrinks
 * after two move+refresh cycles" bug. Mirrors the client's exact emission
 * (boxEmit): every geometry patch carries box +
 * rotation. Deleted after diagnosis.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, test } from 'vitest';

import { toPageRef, type PageBox } from '@embedpdf/engine-core/runtime';
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
  'annotations.pdf',
);

const PAGE = 3;

type R = PageBox;
const size = (r: R) => ({ w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
const center = (r: R) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const translate = (r: R, dx: number, dy: number): R => ({ ...r, x: r.x + dx, y: r.y + dy });
/** AABB of box r rotated by theta about its center (same result y-up/y-down). */
const aabb = (r: R, deg: number): R => {
  const t = (Math.abs(deg) * Math.PI) / 180;
  const { w, h } = size(r);
  const W = w * Math.abs(Math.cos(t)) + h * Math.abs(Math.sin(t));
  const H = w * Math.abs(Math.sin(t)) + h * Math.abs(Math.cos(t));
  const c = center(r);
  return { x: c.x - W / 2, y: c.y - H / 2, width: W, height: H };
};

const fmt = (r: R | undefined | null) =>
  r
    ? `[${r.x.toFixed(1)},${r.y.toFixed(1)} → ${(r.x + r.width).toFixed(1)},${(r.y + r.height).toFixed(1)}] (${size(r).w}×${size(r).h})`
    : String(r);

/** Alpha-ink bounding box of an RGBA raster, as a fraction of raster size. */
function inkFraction(raster: { width: number; height: number; data: ArrayBuffer }) {
  const d = new Uint8Array(raster.data);
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (d[(y * raster.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { fx: 0, fy: 0 };
  return {
    fx: +((maxX - minX + 1) / raster.width).toFixed(3),
    fy: +((maxY - minY + 1) / raster.height).toFixed(3),
  };
}

describe('rotated circle move drift probe', () => {
  let engine: LocalEngine;
  let pdf: Uint8Array;

  beforeAll(async () => {
    pdf = new Uint8Array(await readFile(pdfPath));
    engine = await createLocalEngine({ runtime: { prefer: 'native' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  test('create rotated → (move → save → reopen) × 2, dumping geometry', async () => {
    const ROTATION = 20; // degrees clockwise, as the client passes it
    let U: R = { x: 100, y: 212, width: 120, height: 80 }; // 120×80

    let doc = await engine.open({ kind: 'bytes', id: 'probe-0', bytes: pdf });
    const created = await doc.page(toPageRef(PAGE)).annotations.create({
      subtype: 'circle',
      contents: 'drift probe',
      box: U,
      rotation: ROTATION,
      interiorColor: { r: 250, g: 204, b: 21 },
      color: { r: 220, g: 80, b: 80 },
      strokeWidth: 6,
      borderStyle: 'solid',
      opacity: 1,
    });
    const cd = created.annotation as { rect: R; box?: R; rotation?: number };
    console.log('CREATED   rect=' + fmt(cd.rect), 'unrot=' + fmt(cd.box), 'rot=' + cd.rotation);

    const dump = async (label: string, d: typeof doc) => {
      const list = await d.page(toPageRef(PAGE)).annotations.list();
      const a = list.annotations.find(
        (x) => x.subtype === 'circle' && x.contents === 'drift probe',
      ) as unknown as { ref: unknown; rect: R; box?: R; rotation?: number };
      const rendered = await d.page(toPageRef(PAGE)).annotations.renderAppearancesRaw();
      const ap = rendered.appearances.find(
        (p) => JSON.stringify((p as { ref: unknown }).ref) === JSON.stringify(a.ref),
      ) as unknown as {
        rect: PageBox;
        raster: { width: number; height: number; data: ArrayBuffer };
      };
      const ink = ap ? inkFraction(ap.raster) : null;
      console.log(
        label,
        '\n  /Rect      =',
        fmt(a.rect),
        '\n  unrotRect  =',
        fmt(a.box),
        '\n  rotation   =',
        a.rotation,
        '\n  AP rect    =',
        ap ? fmt(ap.rect) : 'none',
        '\n  ink fill   =',
        ink ? `fx=${ink.fx} fy=${ink.fy}` : 'none',
      );
      return a;
    };

    let a = await dump('AFTER CREATE', doc);

    for (let move = 1; move <= 3; move++) {
      // Mimic the client after refresh: model rect := listed box
      // (fallback /Rect), rot := listed rotation.
      const modelRect = a.box ?? a.rect;
      const rot = a.rotation ?? 0;
      U = translate(modelRect, 30, 15);
      const res = await doc.page(toPageRef(PAGE)).annotations.update(
        a.ref as never,
        {
          subtype: 'circle',
          box: U,
          rotation: rot,
        } as never,
      );
      const outcome = (res as { appearance?: { action?: string } }).appearance;
      const echo = (res as { annotation: { rect: R; box?: R; rotation?: number } }).annotation;
      console.log(
        `\nMOVE ${move}: sent rect=${fmt(aabb(U, rot))} unrot=${fmt(U)} rot=${rot}`,
        '→ appearance:',
        JSON.stringify(outcome),
      );
      console.log(
        `  ECHO (res.updated): rect=${fmt(echo.rect)} unrot=${fmt(echo.box)} rot=${echo.rotation}`,
      );
      await dump(`AFTER MOVE ${move} (same session)`, doc);

      const bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
      doc = await engine.open({ kind: 'bytes', id: `probe-${move}`, bytes });
      a = await dump(`AFTER MOVE ${move} + SAVE + REOPEN`, doc);
    }
    await doc.close();
  }, 120000);
});
