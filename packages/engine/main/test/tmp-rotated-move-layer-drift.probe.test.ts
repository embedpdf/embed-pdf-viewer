/**
 * Temporary probe #2 — same rotated-circle move sequence as probe #1, but
 * persisted through the layer pipeline (downloadLayer → reopen base+artifact),
 * which is what the dashboard's refresh actually does. Deleted after diagnosis.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, test } from 'vitest';

import { toPageRef } from '@embedpdf/engine-core/runtime';
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

interface R {
  left: number;
  bottom: number;
  right: number;
  top: number;
}
const size = (r: R) => ({ w: +(r.right - r.left).toFixed(2), h: +(r.top - r.bottom).toFixed(2) });
const center = (r: R) => ({ x: (r.left + r.right) / 2, y: (r.bottom + r.top) / 2 });
const translate = (r: R, dx: number, dy: number): R => ({
  left: r.left + dx,
  bottom: r.bottom + dy,
  right: r.right + dx,
  top: r.top + dy,
});
const aabb = (r: R, deg: number): R => {
  const t = (Math.abs(deg) * Math.PI) / 180;
  const { w, h } = size(r);
  const W = w * Math.abs(Math.cos(t)) + h * Math.abs(Math.sin(t));
  const H = w * Math.abs(Math.sin(t)) + h * Math.abs(Math.cos(t));
  const c = center(r);
  return { left: c.x - W / 2, bottom: c.y - H / 2, right: c.x + W / 2, top: c.y + H / 2 };
};
const fmt = (r: R | undefined | null) =>
  r
    ? `[${r.left.toFixed(1)},${r.bottom.toFixed(1)} → ${r.right.toFixed(1)},${r.top.toFixed(1)}] (${size(r).w}×${size(r).h})`
    : String(r);

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

describe('rotated circle move drift probe — LAYER pipeline', () => {
  let engine: LocalEngine;
  let base: Uint8Array;

  beforeAll(async () => {
    base = new Uint8Array(await readFile(pdfPath));
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  test('create rotated → (reopen layer → move → export) × 3', async () => {
    const ROT_PDF = 340;
    let U: R = { left: 100, bottom: 500, right: 220, top: 580 };

    const dump = async (label: string, d: Awaited<ReturnType<LocalEngine['open']>>) => {
      const list = await d.page(toPageRef(PAGE)).annotations.list();
      const a = list.annotations.find(
        (x) => x.subtype === 'circle' && x.contents === 'drift probe',
      ) as unknown as { ref: unknown; rect: R; unrotatedRect?: R; rotation?: number };
      const rendered = await d.page(toPageRef(PAGE)).annotations.renderAppearancesRaw();
      const ap = rendered.appearances.find(
        (p) => JSON.stringify((p as { ref: unknown }).ref) === JSON.stringify(a.ref),
      ) as unknown as { rect: R; raster: { width: number; height: number; data: ArrayBuffer } };
      const ink = ap ? inkFraction(ap.raster) : null;
      console.log(
        label,
        '\n  /Rect      =',
        fmt(a.rect),
        '\n  unrotRect  =',
        fmt(a.unrotatedRect),
        '\n  rotation   =',
        a.rotation,
        '\n  AP rect    =',
        ap ? fmt(ap.rect) : 'none',
        '\n  ink fill   =',
        ink ? `fx=${ink.fx} fy=${ink.fy}` : 'none',
      );
      return a;
    };

    // Session 0: fresh layer, create, export.
    let doc = await engine.open({
      kind: 'layerBytes',
      id: 'layer-0',
      baseBytes: base,
      layer: { kind: 'fresh' },
    });
    await doc.page(toPageRef(PAGE)).annotations.create({
      subtype: 'circle',
      contents: 'drift probe',
      rect: aabb(U, ROT_PDF),
      unrotatedRect: U,
      rotation: ROT_PDF,
      interiorColor: { r: 250, g: 204, b: 21 },
      color: { r: 220, g: 80, b: 80 },
      strokeWidth: 6,
      borderStyle: 'solid',
      opacity: 1,
    });
    await dump('AFTER CREATE (session 0)', doc);
    let artifact = await doc.downloadLayer!();
    await doc.close();

    for (let move = 1; move <= 3; move++) {
      doc = await engine.open({
        kind: 'layerBytes',
        id: `layer-${move}`,
        baseBytes: base,
        layer: { kind: 'artifact', bytes: artifact },
      });
      const a = await dump(`REOPENED before move ${move}`, doc);

      const modelRect = a.unrotatedRect ?? a.rect;
      const rot = a.rotation ?? 0;
      U = translate(modelRect, 30, 15);
      const res = await doc.page(toPageRef(PAGE)).annotations.update(
        a.ref as never,
        {
          subtype: 'circle',
          rect: aabb(U, rot),
          unrotatedRect: U,
          rotation: rot,
        } as never,
      );
      console.log(
        `\nMOVE ${move}: sent rect=${fmt(aabb(U, rot))} unrot=${fmt(U)} rot=${rot}`,
        '→ appearance:',
        JSON.stringify((res as { appearance?: unknown }).appearance),
      );
      await dump(`AFTER MOVE ${move} (same session)`, doc);
      artifact = await doc.downloadLayer!();
      await doc.close();
    }

    doc = await engine.open({
      kind: 'layerBytes',
      id: 'layer-final',
      baseBytes: base,
      layer: { kind: 'artifact', bytes: artifact },
    });
    await dump('FINAL REOPEN', doc);
    await doc.close();
  }, 120000);
});
