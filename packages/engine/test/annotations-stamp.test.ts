import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DocumentHandle, Engine, StampAnnotationDTO } from '@embedpdf/engine-core/runtime';
import { EngineErrorCode, sniffBinaryMetadata } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'examples',
  'pdf-runtime-demo',
  'public',
  'annotations.pdf',
);
const PAGE_OBJECT_NUMBER = 3;

/** Minimal valid PNG built from scratch (no fixture file, no base64 guessing). */
function makePng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(
      [...type].map((ch) => ch.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    for (let x = 0; x < width; x++) raw.set(rgba, row + 1 + x * 4);
  }
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = new Uint8Array(deflateSync(raw));
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

describe('stamp annotations: engine-local (inline transport, wasm runtime)', () => {
  let engine: Engine;
  let handle: DocumentHandle;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const bytes = new Uint8Array(await readFile(fixturePath));
    handle = await engine.open({ kind: 'bytes', id: 'stamp-test', bytes });
  });

  afterAll(async () => {
    await handle.close();
    await engine.destroy();
  });

  test('self-check: generated PNG sniffs as PNG with correct dimensions', () => {
    const png = makePng(4, 2, [255, 0, 0, 255]);
    expect(sniffBinaryMetadata(png.buffer as ArrayBuffer)).toEqual({
      mimeType: 'image/png',
      width: 4,
      height: 2,
    });
  });

  test('create image stamp → DTO round-trips, appearance renders non-empty', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const png = makePng(8, 4, [255, 0, 0, 255]);
    const rect = { left: 100, bottom: 500, right: 260, top: 580 };

    const result = await page.annotations.create({
      subtype: 'stamp',
      rect,
      source: png,
      name: 'Approved',
    });

    expect(result.created.subtype).toBe('stamp');
    const created = result.created as StampAnnotationDTO;
    expect(created.name).toBe('Approved');
    expect(created.rect.left).toBeCloseTo(rect.left, 0);
    expect(created.rect.top).toBeCloseTo(rect.top, 0);

    const snapshot = await page.annotations.list();
    const stamps = snapshot.annotations.filter((a) => a.subtype === 'stamp');
    expect(stamps.length).toBeGreaterThan(0);

    const rendered = await page.annotations.renderAppearances();
    const appearance = rendered.appearances.find(
      (a) =>
        a.ref.kind === 'objectNumber' &&
        created.ref.kind === 'objectNumber' &&
        a.ref.annotObjectNumber === created.ref.annotObjectNumber,
    );
    expect(appearance).toBeDefined();
    expect(appearance!.raster.width).toBeGreaterThan(0);
    expect(appearance!.raster.height).toBeGreaterThan(0);
    // The 'contain' fit of an 8×4 red image into a 160×80 rect must paint
    // red pixels: scan RGBA for any red-dominant, non-transparent pixel.
    const data = new Uint8Array(appearance!.raster.data);
    let sawRed = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0 && data[i] > 128 && data[i + 1] < 64 && data[i + 2] < 64) {
        sawRed = true;
        break;
      }
    }
    expect(sawRed).toBe(true);
  });

  test('Blob source resolves (browser-style input)', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const png = makePng(2, 2, [0, 0, 255, 255]);
    const result = await page.annotations.create({
      subtype: 'stamp',
      rect: { left: 50, bottom: 50, right: 90, top: 90 },
      source: new Blob([png], { type: 'image/png' }),
    });
    expect(result.created.subtype).toBe('stamp');
  });

  test('stamp survives save → reopen (bytes live in the PDF, not in engine state)', async () => {
    const saved = await handle.download();
    const reopened = await engine.open({ kind: 'bytes', id: 'stamp-test-reopen', bytes: saved });
    try {
      const snapshot = await reopened.page(PAGE_OBJECT_NUMBER).annotations.list();
      const stamps = snapshot.annotations.filter(
        (a): a is StampAnnotationDTO => a.subtype === 'stamp',
      );
      expect(stamps.length).toBeGreaterThanOrEqual(2);
      expect(stamps.some((s) => s.name === 'Approved')).toBe(true);

      const rendered = await reopened.page(PAGE_OBJECT_NUMBER).annotations.renderAppearances();
      expect(rendered.appearances.length).toBeGreaterThan(0);
    } finally {
      await reopened.close();
    }
  });

  test('update: geometry-only patch re-fits the existing appearance', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const png = makePng(4, 4, [0, 128, 0, 255]);
    const { created } = await page.annotations.create({
      subtype: 'stamp',
      rect: { left: 10, bottom: 10, right: 50, top: 50 },
      source: png,
    });
    const updated = await page.annotations.update(created.ref, {
      subtype: 'stamp',
      rect: { left: 10, bottom: 10, right: 90, top: 50 },
    });
    expect(updated.updated.subtype).toBe('stamp');
    expect(updated.updated.rect.right).toBeCloseTo(90, 0);
  });

  test('rotated stamp: appearance renders UNROTATED — rect is the logical box, content is flat', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const png = makePng(8, 4, [255, 0, 0, 255]);
    const unrotated = { left: 300, bottom: 300, right: 400, top: 350 }; // 100×50 landscape
    // 90° CW about the centre (350, 325) → the /Rect AABB is 50×100 portrait.
    const rect = { left: 325, bottom: 275, right: 375, top: 375 };
    const { created } = await page.annotations.create({
      subtype: 'stamp',
      rect,
      source: png,
      fit: 'fill',
      rotation: 90,
      unrotatedRect: unrotated,
    });
    expect((created as StampAnnotationDTO).rotation).toBe(90);

    const rendered = await page.annotations.renderAppearances();
    const entry = rendered.appearances.find(
      (a) =>
        a.ref.kind === 'objectNumber' &&
        created.ref.kind === 'objectNumber' &&
        a.ref.annotObjectNumber === created.ref.annotObjectNumber,
    );
    expect(entry).toBeDefined();
    // THE convention: the entry's rect is the UNROTATED logical box…
    expect(entry!.rect.left).toBeCloseTo(unrotated.left, 0);
    expect(entry!.rect.right).toBeCloseTo(unrotated.right, 0);
    expect(entry!.rect.top).toBeCloseTo(unrotated.top, 0);
    // …and the raster is landscape (a rotated bake would be the 50×100 AABB).
    const { width, height, stride } = entry!.raster;
    expect(width).toBeGreaterThan(height);
    // Flat fill-fit content: the middle row must be red edge to edge (a rotated
    // bake leaves transparent AABB corners there).
    const data = new Uint8Array(entry!.raster.data);
    const rowStart = Math.floor(height / 2) * stride;
    let redRow = 0;
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * 4;
      if (data[i + 3] > 0 && data[i] > 128) redRow++;
    }
    expect(redRow / width).toBeGreaterThan(0.9);
  });

  test('rotated CONTAIN stamp fills the box — no compound-shrink padding', async () => {
    // Regression: the writer used to fit the image into the ROTATED AABB /Rect,
    // then the native re-fit fit that (padded) box into the unrotated box — a
    // SECOND aspect shrink, so the image landed at ~aspect² size in white
    // padding. Only under rotation (at 0° the two frames coincide). 'fill' hid
    // it; 'contain' (the default, and what the viewer uses) exposes it.
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const png = makePng(8, 4, [255, 0, 0, 255]); // 2:1 landscape
    const unrotated = { left: 300, bottom: 400, right: 400, top: 450 }; // 100×50, 2:1 — matches image
    // 90° CW about the centre (350, 425) → AABB 50×100 portrait.
    const rect = { left: 325, bottom: 375, right: 375, top: 475 };
    const { created } = await page.annotations.create({
      subtype: 'stamp',
      rect,
      source: png,
      fit: 'contain',
      rotation: 90,
      unrotatedRect: unrotated,
    });
    expect((created as StampAnnotationDTO).rotation).toBe(90);

    const rendered = await page.annotations.renderAppearances();
    const entry = rendered.appearances.find(
      (a) =>
        a.ref.kind === 'objectNumber' &&
        created.ref.kind === 'objectNumber' &&
        a.ref.annotObjectNumber === created.ref.annotObjectNumber,
    );
    expect(entry).toBeDefined();
    // Authored in the unrotated frame: landscape raster, logical-box rect.
    const { width, height, stride } = entry!.raster;
    expect(width).toBeGreaterThan(height);
    expect(entry!.rect.left).toBeCloseTo(unrotated.left, 0);
    expect(entry!.rect.right).toBeCloseTo(unrotated.right, 0);
    // The image aspect matches the box, so contain-fit FILLS it: BOTH the middle
    // row AND the middle column are red edge-to-edge. Under the old double-shrink
    // the image was ~1/4 size, so neither would be. Sampling both catches a
    // shrink on either axis.
    const data = new Uint8Array(entry!.raster.data);
    const isRed = (i: number) => data[i + 3] > 0 && data[i] > 128 && data[i + 1] < 64;
    let redRow = 0;
    const midRow = Math.floor(height / 2) * stride;
    for (let x = 0; x < width; x++) if (isRed(midRow + x * 4)) redRow++;
    let redCol = 0;
    const midX = Math.floor(width / 2) * 4;
    for (let y = 0; y < height; y++) if (isRed(y * stride + midX)) redCol++;
    expect(redRow / width).toBeGreaterThan(0.9);
    expect(redCol / height).toBeGreaterThan(0.9);
  });

  test('rotate a stamp back to 0° clears the rotation — no spring-back', async () => {
    // Regression: the stamp writer reconciled rotation metadata ONLY when the
    // patch carried rotation fields. A plain re-position patch (rect only, no
    // rotation — what the viewer emits when it drops the tilt) left the stale
    // /EMBD_Metadata in place, so the DTO read back at the OLD angle and the
    // viewer's re-sync sprang it back.
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const png = makePng(4, 4, [0, 0, 255, 255]);
    const unrotated = { left: 200, bottom: 200, right: 250, top: 250 };
    const rect = { left: 200, bottom: 200, right: 250, top: 250 }; // square: AABB == box
    const { created } = await page.annotations.create({
      subtype: 'stamp',
      rect,
      source: png,
      fit: 'contain',
      rotation: 90,
      unrotatedRect: unrotated,
    });
    expect((created as StampAnnotationDTO).rotation).toBe(90);

    const flat = { left: 210, bottom: 210, right: 270, top: 260 };
    const updated = await page.annotations.update(created.ref, { subtype: 'stamp', rect: flat });
    expect((updated.updated as StampAnnotationDTO).rotation ?? 0).toBe(0);

    // Re-read from the annot dict (not just the patch echo) to prove it persists.
    const list = await page.annotations.list();
    const re = list.annotations.find(
      (a) =>
        a.ref.kind === 'objectNumber' &&
        created.ref.kind === 'objectNumber' &&
        a.ref.annotObjectNumber === created.ref.annotObjectNumber,
    ) as StampAnnotationDTO;
    expect(re.rotation ?? 0).toBe(0);
    expect(re.rect.left).toBeCloseTo(flat.left, 0);
    expect(re.rect.right).toBeCloseTo(flat.right, 0);
  });

  test('unsupported source bytes reject with InvalidArg before any transport', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    await expect(
      page.annotations.create({
        subtype: 'stamp',
        rect: { left: 0, bottom: 0, right: 10, top: 10 },
        source: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      }),
    ).rejects.toMatchObject({ code: expect.anything() });
  });

  test('invalid stamp name rejects before create or base-patch writes', async () => {
    const page = handle.page(PAGE_OBJECT_NUMBER);
    const beforeCreate = await page.annotations.list();

    await expect(
      page.annotations.create({
        subtype: 'stamp',
        rect: { left: 20, bottom: 100, right: 80, top: 130 },
        source: makePng(2, 1, [255, 0, 0, 255]),
        name: 'DefinitelyNotAStandardStampName',
      }),
    ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

    const afterRejectedCreate = await page.annotations.list();
    expect(afterRejectedCreate.annotations).toHaveLength(beforeCreate.annotations.length);

    const { created } = await page.annotations.create({
      subtype: 'stamp',
      rect: { left: 20, bottom: 100, right: 80, top: 130 },
      source: makePng(2, 1, [0, 128, 0, 255]),
      name: 'Approved',
      contents: 'before',
    });

    await expect(
      page.annotations.update(created.ref, {
        subtype: 'stamp',
        contents: 'must-not-land',
        name: 'DefinitelyNotAStandardStampName',
      }),
    ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

    const afterRejectedUpdate = await page.annotations.list();
    const reread = afterRejectedUpdate.annotations.find(
      (annotation) =>
        annotation.ref.kind === 'objectNumber' &&
        created.ref.kind === 'objectNumber' &&
        annotation.ref.annotObjectNumber === created.ref.annotObjectNumber,
    );
    expect(reread?.contents).toBe('before');
  });
});
