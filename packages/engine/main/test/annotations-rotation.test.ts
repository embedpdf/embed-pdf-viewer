import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import { createLocalEngine, type LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const annotationsPdfPath = resolve(
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

/** A page known to exist and be editable in annotations.pdf. */
const PAGE = 3;

/** A square box, so a 90° turn's AABB equals the authored box. */
const SQUARE_RECT = { left: 60, bottom: 60, right: 160, top: 160 };

/** A triangle that fits inside SQUARE_RECT (valid for polyline/line/ink). */
const VERTICES = [
  { x: 70, y: 70 },
  { x: 150, y: 70 },
  { x: 110, y: 150 },
];

let annotationsPdf: Uint8Array;

beforeAll(async () => {
  annotationsPdf = new Uint8Array(await readFile(annotationsPdfPath));
});

/**
 * Rotation transform metadata must survive a full save → reopen cycle.
 *
 * Box kinds (square/circle/free-text) persist `/Rect` = the rotated AABB plus
 * an `/EMBD_Metadata/UnrotatedRect` + `/EMBD_Metadata/Rotation`, so PDFium can
 * bake a correct `/AP /Matrix`. Vertex kinds (line/polyline/ink) bake the angle
 * into the points and persist only an ADVISORY `/EMBD_Metadata/Rotation` (no
 * unrotatedRect) — PDFium ignores a lone Rotation, so it is inert for AP yet
 * lets EmbedPDF show an oriented selection box and offer reset on reopen.
 */
describe('annotation rotation (local engine) — save + reopen', () => {
  let engine: LocalEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  test('box kind: a rotated square keeps rotation + unrotatedRect after reopen', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-box', bytes: annotationsPdf });
      const created = await doc.page(PAGE).annotations.create({
        subtype: 'square',
        contents: 'rotation: square',
        rect: SQUARE_RECT,
        unrotatedRect: SQUARE_RECT,
        rotation: 90,
        interiorColor: null,
        color: { r: 0, g: 128, b: 0 },
        strokeWidth: 2,
        borderStyle: 'solid',
        opacity: 1,
      });
      expect(created.created.subtype).toBe('square');
      bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
    }

    const doc = await engine.open({ kind: 'bytes', id: 'rot-box-reopened', bytes });
    const list = await doc.page(PAGE).annotations.list();
    const square = list.annotations.find(
      (a) => a.subtype === 'square' && a.contents === 'rotation: square',
    );
    expect(square).toBeDefined();
    if (square && square.subtype === 'square') {
      expect(square.rotation).toBe(90);
      expect(square.unrotatedRect).toBeDefined();
      // a 90°-turned square spans the same AABB it was authored in.
      expect(Math.round(square.unrotatedRect!.left)).toBe(SQUARE_RECT.left);
      expect(Math.round(square.unrotatedRect!.right)).toBe(SQUARE_RECT.right);
    }
    await doc.close();
  });

  test('box kind: clearing rotation on update drops the metadata after reopen', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-reset', bytes: annotationsPdf });
      const created = await doc.page(PAGE).annotations.create({
        subtype: 'square',
        contents: 'rotation: reset',
        rect: SQUARE_RECT,
        unrotatedRect: SQUARE_RECT,
        rotation: 90,
        interiorColor: null,
        color: { r: 0, g: 128, b: 0 },
        strokeWidth: 2,
        borderStyle: 'solid',
        opacity: 1,
      });
      // Reset: send the box back with no rotation. The writer must CLEAR the
      // EMBD keys, not leave them stale.
      await doc.page(PAGE).annotations.update(created.created.ref, {
        subtype: 'square',
        rect: SQUARE_RECT,
      });
      bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
    }

    const doc = await engine.open({ kind: 'bytes', id: 'rot-reset-reopened', bytes });
    const list = await doc.page(PAGE).annotations.list();
    const square = list.annotations.find(
      (a) => a.subtype === 'square' && a.contents === 'rotation: reset',
    );
    expect(square).toBeDefined();
    if (square && square.subtype === 'square') {
      expect(square.rotation).toBeUndefined();
      expect(square.unrotatedRect).toBeUndefined();
    }
    await doc.close();
  });

  test('vertex kinds: polyline/line/ink keep an advisory rotation (no unrotatedRect) after reopen', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-vertex', bytes: annotationsPdf });
      const page = doc.page(PAGE);

      await page.annotations.create({
        subtype: 'polyline',
        contents: 'rotation: polyline',
        rect: SQUARE_RECT,
        vertices: VERTICES,
        rotation: 30,
        interiorColor: null,
        color: { r: 200, g: 0, b: 0 },
        strokeWidth: 2,
        borderStyle: 'solid',
        opacity: 1,
        lineEndings: { start: 'none', end: 'none' },
      });

      await page.annotations.create({
        subtype: 'line',
        contents: 'rotation: line',
        rect: SQUARE_RECT,
        linePoints: { start: { x: 70, y: 70 }, end: { x: 150, y: 150 } },
        rotation: 45,
        interiorColor: null,
        color: { r: 0, g: 128, b: 128 },
        strokeWidth: 2,
        borderStyle: 'solid',
        opacity: 1,
        lineEndings: { start: 'none', end: 'none' },
      });

      await page.annotations.create({
        subtype: 'ink',
        contents: 'rotation: ink',
        rect: SQUARE_RECT,
        inkList: [VERTICES],
        rotation: 60,
        color: { r: 29, g: 78, b: 216 },
        strokeWidth: 3,
        borderStyle: 'solid',
        opacity: 1,
      });

      bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
    }

    const doc = await engine.open({ kind: 'bytes', id: 'rot-vertex-reopened', bytes });
    const list = await doc.page(PAGE).annotations.list();

    const polyline = list.annotations.find(
      (a) => a.subtype === 'polyline' && a.contents === 'rotation: polyline',
    );
    expect(polyline).toBeDefined();
    if (polyline && polyline.subtype === 'polyline') {
      expect(polyline.rotation).toBe(30);
      expect('unrotatedRect' in polyline && polyline.unrotatedRect).toBeFalsy();
    }

    const line = list.annotations.find(
      (a) => a.subtype === 'line' && a.contents === 'rotation: line',
    );
    expect(line).toBeDefined();
    if (line && line.subtype === 'line') {
      expect(line.rotation).toBe(45);
      expect('unrotatedRect' in line && line.unrotatedRect).toBeFalsy();
    }

    const ink = list.annotations.find((a) => a.subtype === 'ink' && a.contents === 'rotation: ink');
    expect(ink).toBeDefined();
    if (ink && ink.subtype === 'ink') {
      expect(ink.rotation).toBe(60);
      expect('unrotatedRect' in ink && ink.unrotatedRect).toBeFalsy();
    }

    // Appearances for vertex kinds stay on the CLASSIC render path: their
    // rotation is baked into the vertices (advisory /Rotation only), so the
    // entry's rect is the annotation's own /Rect — never remapped to an
    // unrotated box — and the raster contains the drawn strokes.
    const rendered = await doc.page(PAGE).annotations.renderAppearances();
    for (const dto of [polyline!, line!, ink!]) {
      const ap = rendered.appearances.find(
        (a) =>
          a.ref.kind === 'objectNumber' &&
          dto.ref.kind === 'objectNumber' &&
          a.ref.annotObjectNumber === dto.ref.annotObjectNumber,
      );
      expect(ap, `appearance for ${dto.subtype}`).toBeDefined();
      expect(ap!.rect.left).toBeCloseTo(dto.rect.left, 0);
      expect(ap!.rect.bottom).toBeCloseTo(dto.rect.bottom, 0);
      expect(ap!.rect.right).toBeCloseTo(dto.rect.right, 0);
      expect(ap!.rect.top).toBeCloseTo(dto.rect.top, 0);
      const data = new Uint8Array(ap!.raster.data);
      expect(data.some((_, idx) => idx % 4 === 3 && data[idx] > 0)).toBe(true); // non-empty
    }
    await doc.close();
  });
});
