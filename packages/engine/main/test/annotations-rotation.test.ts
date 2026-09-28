import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import { appearanceTurnOf, toPageRef } from '@embedpdf/engine-core/runtime';
import { createLocalEngine, type LocalEngine } from '../src/index';
import { encodePng } from '../src/render/PortableImageEncoder';

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

type Rect = { left: number; bottom: number; right: number; top: number };

function rotatedAabb(rect: Rect, degrees: number): Rect {
  const radians = (degrees * Math.PI) / 180;
  const width = rect.right - rect.left;
  const height = rect.top - rect.bottom;
  const aabbWidth = width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians));
  const aabbHeight = width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians));
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.bottom + rect.top) / 2;
  return {
    left: centerX - aabbWidth / 2,
    bottom: centerY - aabbHeight / 2,
    right: centerX + aabbWidth / 2,
    top: centerY + aabbHeight / 2,
  };
}

function alphaCoverage(raster: { width: number; height: number; data: ArrayBuffer }): {
  x: number;
  y: number;
} {
  const bytes = new Uint8Array(raster.data);
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (bytes[(y * raster.width + x) * 4 + 3]! > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < 0
    ? { x: 0, y: 0 }
    : { x: (maxX - minX + 1) / raster.width, y: (maxY - minY + 1) / raster.height };
}

let annotationsPdf: Uint8Array;

beforeAll(async () => {
  annotationsPdf = new Uint8Array(await readFile(annotationsPdfPath));
});

/**
 * Rotation transform metadata must survive a full save → reopen cycle.
 *
 * Box kinds (square/circle/free-text) persist `/Rect` = the upright box around
 * the turned drawing plus their `box` in `/EMBD_Metadata/UnrotatedRect` and
 * `/EMBD_Metadata/Rotation`, so PDFium can bake a correct `/AP /Matrix`.
 * Vertex kinds (line/polyline/ink) bake the angle into the points and persist
 * only an advisory `/EMBD_Metadata/Rotation` (no box) — PDFium ignores a lone
 * Rotation, so it is inert for AP yet lets EmbedPDF show an oriented selection
 * box and offer reset on reopen.
 */
describe('annotation rotation (local engine) — save + reopen', () => {
  let engine: LocalEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  test('box kind: a rotated square keeps its rotation and box after reopen', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-box', bytes: annotationsPdf });
      const created = await doc.page(toPageRef(PAGE)).annotations.create({
        subtype: 'square',
        contents: 'rotation: square',
        box: SQUARE_RECT,
        rotation: 90,
        interiorColor: null,
        color: { r: 0, g: 128, b: 0 },
        strokeWidth: 2,
        borderStyle: 'solid',
        opacity: 1,
      });
      expect(created.annotation.subtype).toBe('square');
      bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
    }

    const doc = await engine.open({ kind: 'bytes', id: 'rot-box-reopened', bytes });
    const list = await doc.page(toPageRef(PAGE)).annotations.list();
    const square = list.annotations.find(
      (a) => a.subtype === 'square' && a.contents === 'rotation: square',
    );
    expect(square).toBeDefined();
    if (square && square.subtype === 'square') {
      expect(square.rotation).toBe(90);
      expect(square.box).toBeDefined();
      // a 90°-turned square spans the same AABB it was authored in.
      expect(Math.round(square.box.left)).toBe(SQUARE_RECT.left);
      expect(Math.round(square.box.right)).toBe(SQUARE_RECT.right);
    }
    await doc.close();
  });

  test('box move preserves a rotated appearance when the new AABB contains its old BBox', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    const rotation = 45;
    const originalBox = { left: 100, bottom: 100, right: 300, top: 300 };
    const movedBox = { left: 80, bottom: 100, right: 280, top: 300 };

    let artifact: Uint8Array;
    let ref: unknown;
    {
      const doc = await engine.open({
        kind: 'layerBytes',
        id: 'rot-move',
        baseBytes: annotationsPdf,
        layer: { kind: 'fresh' },
      });
      const page = doc.page(toPageRef(PAGE));
      const created = await page.annotations.create({
        subtype: 'circle',
        contents: 'rotation: preserved move',
        box: originalBox,
        rotation,
        interiorColor: { r: 255, g: 213, b: 0 },
        color: { r: 229, g: 72, b: 77 },
        strokeWidth: 6,
        borderStyle: 'solid',
        opacity: 1,
      });
      ref = created.annotation.ref;

      const updated = await page.annotations.update(created.annotation.ref, {
        subtype: 'circle',
        box: movedBox,
        rotation,
      });
      expect(updated.appearance).toEqual({ action: 'preserved', changed: false });

      artifact = await doc.downloadLayer!();
      await doc.close();
    }

    const doc = await engine.open({
      kind: 'layerBytes',
      id: 'rot-move-reopened',
      baseBytes: annotationsPdf,
      layer: { kind: 'artifact', bytes: artifact },
    });
    const rendered = await doc.page(toPageRef(PAGE)).annotations.renderAppearancesRaw();
    const appearance = rendered.appearances.find(
      (candidate) => JSON.stringify(candidate.ref) === JSON.stringify(ref),
    );
    expect(appearance).toBeDefined();
    expect(appearance!.rect).toMatchObject(movedBox);
    const coverage = alphaCoverage(appearance!.raster);
    expect(coverage.x).toBeGreaterThan(0.98);
    expect(coverage.y).toBeGreaterThan(0.98);
    await doc.close();
  });

  test('box kind: clearing rotation on update drops the metadata after reopen', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-reset', bytes: annotationsPdf });
      const created = await doc.page(toPageRef(PAGE)).annotations.create({
        subtype: 'square',
        contents: 'rotation: reset',
        box: SQUARE_RECT,
        rotation: 90,
        interiorColor: null,
        color: { r: 0, g: 128, b: 0 },
        strokeWidth: 2,
        borderStyle: 'solid',
        opacity: 1,
      });
      // Reset: state the clear explicitly (tri-state — omission would
      // preserve the rotation; `null` removes the EMBD keys).
      await doc.page(toPageRef(PAGE)).annotations.update(created.annotation.ref, {
        subtype: 'square',
        box: SQUARE_RECT,
        rotation: null,
      });
      bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
    }

    const doc = await engine.open({ kind: 'bytes', id: 'rot-reset-reopened', bytes });
    const list = await doc.page(toPageRef(PAGE)).annotations.list();
    const square = list.annotations.find(
      (a) => a.subtype === 'square' && a.contents === 'rotation: reset',
    );
    expect(square).toBeDefined();
    if (square && square.subtype === 'square') {
      expect(square.rotation).toBe(null);
      expect(square.box).toEqual(SQUARE_RECT);
    }
    await doc.close();
  });

  test('vertex kinds: polyline/line/ink keep an advisory rotation (no box) after reopen', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-vertex', bytes: annotationsPdf });
      const page = doc.page(toPageRef(PAGE));

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
    const list = await doc.page(toPageRef(PAGE)).annotations.list();

    const polyline = list.annotations.find(
      (a) => a.subtype === 'polyline' && a.contents === 'rotation: polyline',
    );
    expect(polyline).toBeDefined();
    if (polyline && polyline.subtype === 'polyline') {
      expect(polyline.rotation).toBe(30);
      expect('box' in polyline).toBe(false);
    }

    const line = list.annotations.find(
      (a) => a.subtype === 'line' && a.contents === 'rotation: line',
    );
    expect(line).toBeDefined();
    if (line && line.subtype === 'line') {
      expect(line.rotation).toBe(45);
      expect('box' in line).toBe(false);
    }

    const ink = list.annotations.find((a) => a.subtype === 'ink' && a.contents === 'rotation: ink');
    expect(ink).toBeDefined();
    if (ink && ink.subtype === 'ink') {
      expect(ink.rotation).toBe(60);
      expect('box' in ink).toBe(false);
    }

    // Appearances for vertex kinds stay on the classic render path: their
    // rotation is baked into the vertices (advisory /Rotation only), so the
    // entry's rect is the annotation's own /Rect — never remapped to an
    // unrotated box — and the raster contains the drawn strokes.
    const rendered = await doc.page(toPageRef(PAGE)).annotations.renderAppearancesRaw();
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

  test('box kind: a rotated caret round-trips its box and turn, and its appearance agrees with the read', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });

    // Deliberately asymmetric (8×16) so the rotated AABB (16×8) differs from
    // the unrotated box — the appearance assertion below can then tell the
    // stripped path (rect = unrotated box) from the classic one (rect = /Rect).
    const UNROTATED = { left: 70, bottom: 70, right: 78, top: 86 };
    // 90° about the same centre (74, 78): width/height swap.
    const ROTATED_AABB = { left: 66, bottom: 74, right: 82, top: 82 };

    let bytes: Uint8Array;
    {
      const doc = await engine.open({ kind: 'bytes', id: 'rot-caret', bytes: annotationsPdf });
      const created = await doc.page(toPageRef(PAGE)).annotations.create({
        subtype: 'caret',
        contents: 'rotation: caret',
        box: UNROTATED,
        rotation: 90,
        color: { r: 30, g: 64, b: 175 },
        opacity: 1,
      });
      expect(created.annotation.subtype).toBe('caret');
      bytes = await doc.download({ mode: 'rewrite' });
      await doc.close();
    }

    const doc = await engine.open({ kind: 'bytes', id: 'rot-caret-reopened', bytes });
    const list = await doc.page(toPageRef(PAGE)).annotations.list();
    const caret = list.annotations.find(
      (a) => a.subtype === 'caret' && a.contents === 'rotation: caret',
    );
    expect(caret).toBeDefined();
    if (caret && caret.subtype === 'caret') {
      expect(caret.rotation).toBe(90);
      expect(caret.box).toBeDefined();
      expect(Math.round(caret.box.left)).toBe(UNROTATED.left);
      expect(Math.round(caret.box.bottom)).toBe(UNROTATED.bottom);
      expect(Math.round(caret.box.right)).toBe(UNROTATED.right);
      expect(Math.round(caret.box.top)).toBe(UNROTATED.top);

      // The caret's outline reaches past its box, so `rect` holds more than
      // the turned box and its raster is drawn as the page shows it, placed
      // by `rect`: the same rule (`appearanceTurnOf`) the consumer applies
      // to the read, so it never turns the raster a second time.
      for (const edge of ['left', 'bottom'] as const) {
        expect(caret.rect[edge]).toBeLessThanOrEqual(ROTATED_AABB[edge]);
      }
      for (const edge of ['right', 'top'] as const) {
        expect(caret.rect[edge]).toBeGreaterThanOrEqual(ROTATED_AABB[edge]);
      }
      expect(appearanceTurnOf(caret)).toBe(null);
      const rendered = await doc.page(toPageRef(PAGE)).annotations.renderAppearancesRaw();
      const ap = rendered.appearances.find(
        (a) =>
          a.ref.kind === 'objectNumber' &&
          caret.ref.kind === 'objectNumber' &&
          a.ref.annotObjectNumber === caret.ref.annotObjectNumber,
      );
      expect(ap, 'appearance for caret').toBeDefined();
      expect(ap!.rect.left).toBeCloseTo(caret.rect.left, 2);
      expect(ap!.rect.bottom).toBeCloseTo(caret.rect.bottom, 2);
      expect(ap!.rect.right).toBeCloseTo(caret.rect.right, 2);
      expect(ap!.rect.top).toBeCloseTo(caret.rect.top, 2);
      const data = new Uint8Array(ap!.raster.data);
      expect(data.some((_, idx) => idx % 4 === 3 && data[idx] > 0)).toBe(true); // non-empty
    }
    await doc.close();
  });
});

/** Indirect object `objectNumber` as the saved file last writes it. */
function objectText(bytes: Uint8Array, objectNumber: number): string {
  const text = new TextDecoder('latin1').decode(bytes);
  const matches = [
    ...text.matchAll(new RegExp(`(?:^|\\s)${objectNumber} 0 obj([\\s\\S]*?)endobj`, 'g')),
  ];
  const last = matches.at(-1);
  if (!last) throw new Error(`no object ${objectNumber}`);
  return last[1]!;
}

/**
 * The file keeps the counterclockwise angle, and carries Acrobat's own
 * `/Rotate` only where Acrobat turns an annotation itself: a stamp at any
 * angle, a text box a quarter turn.
 */
describe("annotation rotation (local engine) — Acrobat's /Rotate", () => {
  let engine: LocalEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  test('a turned stamp and a quarter-turned text box carry it; other turns do not', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rot-acrobat', bytes: annotationsPdf });
    const page = doc.page(toPageRef(PAGE));
    const png = await encodePng(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1);
    const box = { left: 100, bottom: 100, right: 200, top: 150 };
    const textBox = (rotation: number) =>
      page.annotations.create({
        subtype: 'free-text',
        box,
        rotation,
        intent: 'free-text',
        fontFamily: 'helvetica',
        fontSize: 12,
        textAlign: 'left',
        contents: `turned ${rotation}`,
      });
    const { annotation: stamp } = await page.annotations.create(
      { subtype: 'stamp', box, rotation: 36 },
      { appearance: png },
    );
    const { annotation: quarter } = await textBox(270);
    const { annotation: other } = await textBox(30);
    const { annotation: square } = await page.annotations.create({
      subtype: 'square',
      box,
      rotation: 36,
    });
    const bytes = await doc.download({ mode: 'rewrite' });
    await doc.close();

    const objectNumberOf = (ref: (typeof stamp)['ref']) => {
      if (ref.kind !== 'objectNumber') throw new Error('expected an object-number ref');
      return ref.annotObjectNumber;
    };
    // 36 degrees clockwise is -36 in the file, as Acrobat writes it.
    expect(objectText(bytes, objectNumberOf(stamp.ref))).toMatch(/\/Rotate -36\b/);
    expect(objectText(bytes, objectNumberOf(stamp.ref))).toMatch(/\/Rotation -36\b/);
    expect(objectText(bytes, objectNumberOf(quarter.ref))).toMatch(/\/Rotate 90\b/);
    expect(objectText(bytes, objectNumberOf(other.ref))).not.toMatch(/\/Rotate\b/);
    expect(objectText(bytes, objectNumberOf(square.ref))).not.toMatch(/\/Rotate\b/);
  });
});
