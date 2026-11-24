/**
 * The viewer-phase engine gaps: a signature field can be authored
 * (`createField` family `signature`), drawn into without signing
 * (`forms.setSignatureAppearance`, refused once signed), and the signing
 * facts travel as `attribution`. Until a mark is in it, the field draws its
 * box in its style; from then on it shows the mark, and its style is locked.
 * The mark is a PNG, a JPEG or a one-page PDF, and `null` takes it out again.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BANDS_JPEG, BANDS_PNG } from '@embedpdf/engine-core/conformance';
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

/** A one-page PDF whose page paints nothing (`q Q`). */
const BLANK_PAGE_PDF = (() => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 60] /Contents 4 0 R /Resources << >> >>',
    '<< /Length 3 >>\nstream\nq Q\nendstream',
  ];
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
})();

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

describe('the mark of a signature field: an image, and no mark', () => {
  const red = [255, 0, 0] as const;
  const green = [0, 255, 0] as const;
  const blue = [0, 0, 255] as const;
  const unknown = new TextEncoder().encode('GIF89a: not a format a mark is read from');

  test('a PNG and a JPEG fill a field, and its appearance renders the picture', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'image-fill', bytes: base },
      { scope: ['*'] },
    );
    try {
      const page = (await doc.pages.list()).pages[0]!;
      for (const [name, bytes, y] of [
        ['png', BANDS_PNG, 120],
        ['jpeg', BANDS_JPEG, 200],
      ] as const) {
        // Three to one, as the bands are: each band is a third of the box.
        const created = await doc.forms.create({
          kind: 'signature',
          name,
          widgets: [{ page: page.ref, rect: { x: 50, y, width: 150, height: 50 } }],
        });
        const filled = await doc.forms.setSignatureAppearance!(created.field.ref, bytes);
        const at = filled.field.widgets[0]!.objectNumber;
        for (const band of [red, green, blue]) {
          expect(await pixelsOf(doc, page.ref.objectNumber, at, band)).toBeGreaterThan(2000);
        }
        expect(
          (await doc.signatures.list()).signatures.find((s) => s.fieldName === name)?.signed,
        ).toBe(false);
      }
    } finally {
      await doc.close();
    }
  });

  test('a PNG mark is kept by a signing', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'image-sign', bytes: base },
      { scope: ['*'] },
    );
    try {
      const page = (await doc.pages.list()).pages[0]!;
      const prepared = await doc.signatures.prepare({
        field: { kind: 'fqn', name: 'sig' },
        signer: { name: 'Signer' },
        appearance: BANDS_PNG,
      });
      const result = await doc.signatures.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.status).toBe('completed');
      const at = result.signature.widget!.objectNumber;
      for (const band of [red, green, blue]) {
        expect(await pixelsOf(doc, page.ref.objectNumber, at, band)).toBeGreaterThan(50);
      }
      // Sealed with the signature: the field gives its mark up no more than it takes another.
      await expect(
        doc.forms.setSignatureAppearance!({ kind: 'fqn', name: 'sig' }, null),
      ).rejects.toMatchObject({ code: EngineErrorCode.ProtectedDocument });
    } finally {
      await doc.close();
    }
  });

  test('bytes that are no PNG, JPEG or PDF are refused; `{ pdf }` takes a PDF only, and refuses an image', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'image-refused', bytes: base },
      { scope: ['*'] },
    );
    try {
      const sig = { kind: 'fqn', name: 'sig' } as const;
      const asStamps = {
        code: EngineErrorCode.InvalidArg,
        message: 'the appearance resource must be PNG, JPEG or one-page PDF bytes',
      };
      await expect(doc.forms.setSignatureAppearance!(sig, unknown)).rejects.toMatchObject(asStamps);
      await expect(
        doc.signatures.prepare({ field: sig, appearance: unknown }),
      ).rejects.toMatchObject(asStamps);
      // `{ pdf }` says the bytes are a PDF, and they don't open as one.
      await expect(doc.forms.setSignatureAppearance!(sig, { pdf: unknown })).rejects.toMatchObject({
        code: EngineErrorCode.MalformedPdf,
        message: 'the appearance PDF could not be opened',
      });
      // `{ pdf }` takes a PDF only: an image under it doesn't open as one either.
      for (const image of [BANDS_PNG, BANDS_JPEG]) {
        await expect(doc.forms.setSignatureAppearance!(sig, { pdf: image })).rejects.toMatchObject({
          code: EngineErrorCode.MalformedPdf,
          message: 'the appearance PDF could not be opened',
        });
        await expect(
          doc.signatures.prepare({ field: sig, appearance: { pdf: image } }),
        ).rejects.toMatchObject({ message: 'the appearance PDF could not be opened' });
      }
      const widget = (await doc.signatures.list()).signatures.find(
        (s) => s.fieldName === 'sig',
      )!.widget!;
      const row = (await doc.forms.list()).widgets.find(
        (w) => w.ref.kind === 'objectNumber' && w.ref.objectNumber === widget.objectNumber,
      )!;
      expect(row.hasMark).toBe(false);
      // The same image as its bytes is drawn.
      const filled = await doc.forms.setSignatureAppearance!(sig, BANDS_PNG);
      const page = (await doc.pages.list()).pages[0]!;
      expect(
        await pixelsOf(doc, page.ref.objectNumber, filled.field.widgets[0]!.objectNumber, green),
      ).toBeGreaterThan(50);
    } finally {
      await doc.close();
    }
  });

  test('a field whose mark is a page that paints nothing is emptied by a clear', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'blank-page-clear', bytes: base },
      { scope: ['*'] },
    );
    try {
      const page = (await doc.pages.list()).pages[0]!;
      const created = await doc.forms.create({
        kind: 'signature',
        name: 'boxed',
        widgets: [
          {
            page: page.ref,
            rect: { x: 50, y: page.size.height - 120, width: 150, height: 50 },
            interiorColor: '#eeeeee',
          },
        ],
      });
      const at = created.field.widgets[0]!.objectNumber;
      const hasMark = async () =>
        (await doc.forms.list()).widgets.find(
          (row) => row.ref.kind === 'objectNumber' && row.ref.objectNumber === at,
        )!.hasMark;
      const drawnBox = await opaquePixels(doc, page.ref.objectNumber, at);
      expect(drawnBox).toBeGreaterThan(5000);

      // A mark that paints nothing: the field reads as having one, and shows no box.
      await doc.forms.setSignatureAppearance!(created.field.ref, { pdf: BLANK_PAGE_PDF });
      expect(await hasMark()).toBe(true);
      expect(await opaquePixels(doc, page.ref.objectNumber, at)).toBe(0);

      await doc.forms.setSignatureAppearance!(created.field.ref, null);
      expect(await hasMark()).toBe(false);
      expect(await opaquePixels(doc, page.ref.objectNumber, at)).toBe(drawnBox);
    } finally {
      await doc.close();
    }
  });

  test('a cleared field is empty: no mark, its box drawn again, a style that can change, and an undo that brings the mark back', async () => {
    const doc = await engine.open(
      { kind: 'bytes', id: 'image-clear', bytes: base },
      { scope: ['*'] },
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
            rect: { x: 50, y: page.size.height - 120, width: 150, height: 50 },
            color: '#1a1a1a',
            interiorColor: '#eeeeee',
          },
        ],
      });
      const widget = created.field.widgets[0]!;
      const at = widget.objectNumber;
      const grey = [0xee, 0xee, 0xee] as const;
      const drawnBox = await pixelsOf(doc, page.ref.objectNumber, at, grey);
      expect(drawnBox).toBeGreaterThan(5000);

      await doc.forms.setSignatureAppearance!(created.field.ref, BANDS_PNG);
      expect(await rowOf(at)).toMatchObject({ hasMark: true });
      expect(await pixelsOf(doc, page.ref.objectNumber, at, grey)).toBe(0);

      const cleared = await doc.forms.setSignatureAppearance!(created.field.ref, null);
      expect(cleared.field.name).toBe('boxed');
      expect(cleared.meta.affectedPages.map((p) => p.objectNumber)).toEqual([
        page.ref.objectNumber,
      ]);
      expect(await rowOf(at)).toMatchObject({
        hasMark: false,
        hasAppearance: true,
        color: '#1a1a1a',
        interiorColor: '#eeeeee',
      });
      // The box, pixel for pixel what the field drew with no mark in it; nothing of the mark is left.
      expect(await pixelsOf(doc, page.ref.objectNumber, at, grey)).toBe(drawnBox);
      expect(await pixelsOf(doc, page.ref.objectNumber, at, red)).toBe(0);

      const restyled = await doc.forms.updateWidget(widget.ref!, { interiorColor: '#00aa00' });
      expect(restyled.appearance).toEqual({ action: 'regenerated', changed: true });
      expect(await pixelsOf(doc, page.ref.objectNumber, at, [0x00, 0xaa, 0x00])).toBeGreaterThan(
        5000,
      );

      await doc.apply({ undoOf: restyled.meta.opId });
      await doc.apply({ undoOf: cleared.meta.opId });
      expect(await rowOf(at)).toMatchObject({ hasMark: true, interiorColor: '#eeeeee' });
      for (const band of [red, green, blue]) {
        expect(await pixelsOf(doc, page.ref.objectNumber, at, band)).toBeGreaterThan(2000);
      }
    } finally {
      await doc.close();
    }
  });
});
