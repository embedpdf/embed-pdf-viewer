/**
 * The viewer-phase engine gaps: a signature field can be authored
 * (`createField` family `signature`), drawn into without signing
 * (`forms.setSignatureAppearance`, refused once signed), and the signing
 * facts travel as `attribution`. Until a mark is in it, the field draws its
 * box in its style; from then on it shows the mark, and its style is locked.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { EngineErrorCode, toPageRef } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;

/** Opaque pixels of one widget's rendered normal appearance — zero means an empty or broken /AP. */
async function opaquePixels(
  doc: Awaited<ReturnType<Engine['open']>>,
  pageObjectNumber: number,
  annotObjectNumber: number,
): Promise<number> {
  const { appearances } = await doc
    .page(toPageRef(pageObjectNumber))
    .forms.renderAppearancesRaw({ viewport: { kind: 'scale', scale: 2 } });
  const ap = appearances.find(
    (a) => a.ref.kind === 'objectNumber' && a.ref.objectNumber === annotObjectNumber,
  );
  if (!ap) return 0;
  const px = new Uint8Array(ap.raster.data);
  let opaque = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]! > 40) opaque++;
  return opaque;
}
/** Pixels of one widget's rendered normal appearance within 12 of `rgb` in each channel. */
async function pixelsOf(
  doc: Awaited<ReturnType<Engine['open']>>,
  pageObjectNumber: number,
  annotObjectNumber: number,
  rgb: readonly [number, number, number],
): Promise<number> {
  const { appearances } = await doc
    .page(toPageRef(pageObjectNumber))
    .forms.renderAppearancesRaw({ viewport: { kind: 'scale', scale: 1 } });
  const ap = appearances.find(
    (a) => a.ref.kind === 'objectNumber' && a.ref.objectNumber === annotObjectNumber,
  );
  if (!ap) return 0;
  const px = new Uint8Array(ap.raster.data);
  let count = 0;
  for (let i = 0; i < px.length; i += 4) {
    const near = rgb.every((channel, at) => Math.abs(px[i + at]! - channel) <= 12);
    if (near && px[i + 3]! > 200) count++;
  }
  return count;
}

let engine: Engine;
let base: Uint8Array;
let artwork: Uint8Array;

beforeAll(async () => {
  engine = await createLocalEngine();
  base = new Uint8Array(await readFile(resolve(here, 'fixtures', 'unsigned_sigfield.pdf')));
  artwork = new Uint8Array(await readFile(resolve(here, 'fixtures', 'signature_artwork.pdf')));
});
afterAll(async () => {
  await engine.destroy();
});

describe('signature fields in the viewer phase', () => {
  test('a signature field is authored, filled visually, and refuses a visual fill once signed', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'visual-fill', bytes: base },
      { scope: ['*'] },
    );
    try {
      const page = (await doc.pages.list()).pages[0]!;
      const created = await doc.forms.create({
        kind: 'signature',
        name: 'sig2',
        widgets: [
          {
            page: page.ref,
            rect: { x: 50, y: page.size.height - 120, width: 200, height: 70 },
          },
        ],
      });
      expect(created.field.kind).toBe('signature');
      expect(created.field.widgets).toHaveLength(1);
      const before = await doc.signatures.list();
      expect(before.signatures.map((s) => [s.fieldName, s.signed])).toEqual([
        ['sig', false],
        ['sig2', false],
      ]);

      // Visual fill: the mark is drawn into the widget; the field stays unsigned.
      const filled = await doc.forms.setSignatureAppearance!(
        { kind: 'fqn', name: 'sig2' },
        { pdf: artwork },
      );
      expect(filled.field.name).toBe('sig2');
      expect(filled.meta.affectedPages.map((p) => p.objectNumber)).toEqual([page.ref.objectNumber]);
      // The mark is actually drawn: the widget's appearance renders opaque pixels
      // (the fork wraps the page into a child form; the outer stream must place it).
      expect(
        await opaquePixels(doc, page.ref.objectNumber, filled.field.widgets[0]!.objectNumber),
      ).toBeGreaterThan(50);
      expect(
        (await doc.signatures.list()).signatures.find((s) => s.fieldName === 'sig2')?.signed,
      ).toBe(false);
      await expect(
        doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'group.total' }, { pdf: artwork }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });

      // Sign the other field with a signer; the facts land in the dictionary.
      const prepared = await doc.signatures.prepare({
        field: { kind: 'fqn', name: 'sig' },
        signer: { name: 'Bob Singor', reason: 'approved', location: 'Amsterdam' },
        appearance: { pdf: artwork },
      });
      const result = await doc.signatures.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.status).toBe('completed');
      expect(result.signature.signer).toMatchObject({
        name: 'Bob Singor',
        reason: 'approved',
        location: 'Amsterdam',
      });
      expect(
        await opaquePixels(doc, page.ref.objectNumber, result.signature.widget!.objectNumber),
      ).toBeGreaterThan(50);
      // A signed field's appearance is sealed with the signature.
      await expect(
        doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'sig' }, { pdf: artwork }),
      ).rejects.toMatchObject({ code: EngineErrorCode.ProtectedDocument });
      // The unsigned field can still be redrawn after the document was versioned.
      const again = await doc.forms.setSignatureAppearance!(
        { kind: 'fqn', name: 'sig2' },
        { pdf: artwork },
      );
      expect(again.field.kind).toBe('signature');
    } finally {
      await doc.close();
    }
  });

  test('a signature field draws its box until a mark is in it, then keeps the mark', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'signature-box', bytes: base },
      {
        scope: ['*'],
      },
    );
    try {
      const page = (await doc.pages.list()).pages[0]!;
      const rowOf = async (objectNumber: number) =>
        (await doc.forms.list()).widgets.find(
          (row) => row.ref.kind === 'objectNumber' && row.ref.objectNumber === objectNumber,
        )!;
      const created = await doc.forms.create({
        kind: 'signature',
        name: 'boxed',
        widgets: [
          {
            page: page.ref,
            rect: { x: 50, y: page.size.height - 120, width: 200, height: 70 },
            color: '#1a1a1a',
            interiorColor: '#eeeeee',
          },
        ],
      });
      const widget = created.field.widgets[0]!;
      const at = widget.objectNumber;
      const grey = [0xee, 0xee, 0xee] as const;
      const red = [0xd4, 0x3c, 0x2c] as const;

      // Placed: the file holds its box, drawn in its style.
      expect(await rowOf(at)).toMatchObject({ hasAppearance: true, hasMark: false });
      expect(await pixelsOf(doc, page.ref.objectNumber, at, grey)).toBeGreaterThan(5000);

      // Restyled: drawn again in the new style.
      const restyled = await doc.forms.updateWidget(widget.ref!, { interiorColor: '#d43c2c' });
      expect(restyled.appearance).toEqual({ action: 'regenerated', changed: true });
      expect(await pixelsOf(doc, page.ref.objectNumber, at, red)).toBeGreaterThan(5000);
      expect(await pixelsOf(doc, page.ref.objectNumber, at, grey)).toBe(0);

      // A mark drawn in: the widget shows it, and its style is locked.
      await doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'boxed' }, { pdf: artwork });
      expect(await rowOf(at)).toMatchObject({ hasMark: true, interiorColor: '#d43c2c' });
      expect(await pixelsOf(doc, page.ref.objectNumber, at, red)).toBe(0);
      await expect(
        doc.forms.updateWidget(widget.ref!, { interiorColor: '#00aa00' }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      // The style it reads, sent back, is no change.
      await doc.forms.updateWidget(widget.ref!, { interiorColor: '#d43c2c', color: '#1a1a1a' });
      // Resized, the mark stays: it isn't drawn over with the box.
      const resized = await doc.forms.updateWidget(widget.ref!, {
        rect: { x: 50, y: page.size.height - 140, width: 240, height: 90 },
      });
      expect(resized.appearance.action).toBe('generation-unavailable');
      expect(await opaquePixels(doc, page.ref.objectNumber, at)).toBeGreaterThan(50);
      expect(await pixelsOf(doc, page.ref.objectNumber, at, red)).toBe(0);

      // A signed field has a mark in it too.
      const fixtureWidget = (await doc.signatures.list()).signatures.find(
        (s) => s.fieldName === 'sig',
      )!.widget!;
      expect(await rowOf(fixtureWidget.objectNumber)).toMatchObject({ hasMark: false });
      const prepared = await doc.signatures.prepare({
        field: { kind: 'fqn', name: 'sig' },
        signer: { name: 'Signer' },
      });
      await doc.signatures.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(await rowOf(fixtureWidget.objectNumber)).toMatchObject({ hasMark: true });
      await expect(
        doc.forms.updateWidget(fixtureWidget.ref!, { color: '#00aa00' }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
    } finally {
      await doc.close();
    }
  });
});
