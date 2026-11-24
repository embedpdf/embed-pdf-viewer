import {
  appearanceRaster,
  maxDifference,
  maxShiftedDifference,
  quarterTurned,
  type Raster,
} from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_JPEG, BANDS_PDF, BANDS_PNG, TWO_PAGE_PDF } from './stampFixtures';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormField } from '../forms/field';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef } from '../identity/PageRef';

/**
 * The mark in a signature field that isn't signed
 * (`forms.setSignatureAppearance`), on both engines: it is a PNG, a JPEG or
 * a one-page PDF, drawn at its own size and fitted whole into the box,
 * upright in a turned field; other bytes are refused before anything is
 * written; `{ pdf }` takes a PDF only; and `null` takes the mark out, so the
 * field shows its own box again, its style can change, and the undo brings
 * the mark back.
 */

export interface SignatureMarkConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh document of `bytes` with every scope. */
  open: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
  /**
   * Whether a signing completes on this engine with a placeholder CMS, so
   * a signed field's mark can be looked at. Default `true`.
   */
  completesSignings?: boolean;
}

/** One empty 300 × 300 page (object 3). */
const PAGE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << >> >>',
  '<< /Length 0 >>\nstream\n\nendstream',
]);

const PAGE = toPageRef(3);

/** A box as wide and as tall as the bands, three to one: the bands fill it. */
const BANDS_BOX: PageBox = { x: 30, y: 30, width: 150, height: 50 };

/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

type Rgb = readonly [number, number, number];
const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const BLUE: Rgb = [0, 0, 255];

export function runSignatureMarkConformance(
  runner: ConformanceTestRunner,
  options: SignatureMarkConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`signature mark conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDoc = async (body: (doc: DocumentHandle) => Promise<void>) => {
      const doc = await options.open(engine, PAGE_PDF.slice());
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    /** The rows of every widget of field `name`, in the field's order. */
    const rowsOf = async (doc: DocumentHandle, name: string): Promise<WidgetAnnotation[]> => {
      const { fields, widgets } = await doc.forms.list();
      const field = fields.find((f) => f.name === name);
      if (!field) throw new Error(`no field '${name}'`);
      return field.widgets.map((widget) => {
        const row = widgets.find((w) => annotationKey(w.ref) === annotationKey(widget.ref!));
        if (!row) throw new Error(`no row for a widget of '${name}'`);
        return row;
      });
    };

    const rowOf = async (doc: DocumentHandle, name: string) => (await rowsOf(doc, name))[0]!;

    /** A new signature field with one box; the box has a look when `styled`. */
    const signatureField = async (
      doc: DocumentHandle,
      name: string,
      placement: { box: PageBox; rotation?: 90 | 180 | 270 } = { box: BANDS_BOX },
      styled = false,
    ): Promise<FormField> => {
      const { field } = await doc.forms.create({
        kind: 'signature',
        name,
        widgets: [
          {
            page: PAGE,
            ...placement,
            ...(styled ? { color: '#1a1a1a', interiorColor: '#eeeeee' } : {}),
          },
        ],
      });
      return field;
    };

    /** The widget as the page shows it: the pixels of its appearance. */
    const drawn = (doc: DocumentHandle, row: WidgetAnnotation) =>
      appearanceRaster(doc.page(PAGE), row.ref, 'forms');

    /** The pixel at a place in the raster, each coordinate a share of its side. */
    const pixelAt = (raster: Raster, x: number, y: number) => {
      const column = Math.min(raster.width - 1, Math.floor(raster.width * x));
      const row = Math.min(raster.height - 1, Math.floor(raster.height * y));
      const at = (row * raster.width + column) * 4;
      return [...raster.rgba.subarray(at, at + 4)] as [number, number, number, number];
    };

    /** Whether the pixel there is drawn in `color`, give or take what a JPEG loses. */
    const shows = (raster: Raster, x: number, y: number, color: Rgb) => {
      const [r, g, b, alpha] = pixelAt(raster, x, y);
      return alpha > 200 && [r, g, b].every((channel, i) => Math.abs(channel - color[i]!) <= 40);
    };

    /** Whether the three bands fill the raster from side to side at height `y`. */
    const showsBands = (raster: Raster, y = 0.5) =>
      shows(raster, 1 / 6, y, RED) &&
      shows(raster, 3 / 6, y, GREEN) &&
      shows(raster, 5 / 6, y, BLUE);

    const refusalOf = (attempt: Promise<unknown>) =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );

    for (const [format, bytes] of [
      ['PNG', BANDS_PNG],
      ['JPEG', BANDS_JPEG],
    ] as const) {
      test(`a ${format} fills a signature field, and the field shows the picture`, async () => {
        await withDoc(async (doc) => {
          const field = await signatureField(doc, 'sig');
          const filled = await doc.forms.setSignatureAppearance(field.ref, bytes);
          expect(filled.field.name).toBe('sig');
          // Nothing is signed: the field has no value, only a mark.
          expect(filled.field.valueEntry).toEqual({ kind: 'none' });
          const row = await rowOf(doc, 'sig');
          expect(row.hasMark).toBe(true);
          expect(showsBands(await drawn(doc, row))).toBe(true);
        });
      });
    }

    test('an image is fitted whole into a box of another shape, with the rest left clear', async () => {
      await withDoc(async (doc) => {
        // A square box: the bands, three to one, take the middle third of its height.
        const field = await signatureField(doc, 'square', {
          box: { x: 30, y: 30, width: 150, height: 150 },
        });
        await doc.forms.setSignatureAppearance(field.ref, BANDS_PNG);
        const raster = await drawn(doc, await rowOf(doc, 'square'));
        expect(showsBands(raster)).toBe(true);
        expect(pixelAt(raster, 0.5, 0.1)[3]).toBe(0);
        expect(pixelAt(raster, 0.5, 0.9)[3]).toBe(0);
      });
    });

    test('an image reads upright in a turned field: the mark turns with its frame', async () => {
      await withDoc(async (doc) => {
        const plain = await signatureField(doc, 'plain');
        await doc.forms.setSignatureAppearance(plain.ref, BANDS_PNG);
        const upright = await drawn(doc, await rowOf(doc, 'plain'));

        const turned = await signatureField(doc, 'turned', {
          box: { ...BANDS_BOX, y: 160 },
          rotation: 90,
        });
        await doc.forms.setSignatureAppearance(turned.ref, BANDS_PNG);
        const row = await rowOf(doc, 'turned');
        expect(row.hasMark).toBe(true);
        const raster = await drawn(doc, row);
        expect([raster.width, raster.height]).toEqual([upright.height, upright.width]);
        expect(maxShiftedDifference(raster, quarterTurned(upright)) <= 3).toBe(true);
      });
    });

    test('a Blob is a mark too, and `{ pdf }` draws what the PDF itself draws', async () => {
      await withDoc(async (doc) => {
        const blob = await signatureField(doc, 'blob');
        await doc.forms.setSignatureAppearance(blob.ref, new Blob([BANDS_PNG.slice()]));
        expect(showsBands(await drawn(doc, await rowOf(doc, 'blob')))).toBe(true);

        // The same box twice over, so the two rasters compare pixel for pixel.
        const keyed = await signatureField(doc, 'keyed', { box: { ...BANDS_BOX, y: 100 } });
        await doc.forms.setSignatureAppearance(keyed.ref, { pdf: BANDS_PDF });
        const bare = await signatureField(doc, 'bare', { box: { ...BANDS_BOX, y: 170 } });
        await doc.forms.setSignatureAppearance(bare.ref, BANDS_PDF);
        const [keyedRow, bareRow] = [await rowOf(doc, 'keyed'), await rowOf(doc, 'bare')];
        expect([keyedRow.hasMark, bareRow.hasMark]).toEqual([true, true]);
        // The PDF is two to one: fitted whole, it leaves the box's sides clear.
        const keyedRaster = await drawn(doc, keyedRow);
        expect(shows(keyedRaster, 0.3, 0.5, RED) && shows(keyedRaster, 0.7, 0.5, BLUE)).toBe(true);
        expect(pixelAt(keyedRaster, 0.05, 0.5)[3]).toBe(0);
        expect(maxDifference(keyedRaster, await drawn(doc, bareRow))).toBe(0);
      });
    });

    test("a mark's bytes are the caller's to keep: the write only reads them", async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'kept');
        const bytes = BANDS_PNG.slice();
        await doc.forms.setSignatureAppearance(field.ref, bytes);
        expect(bytes.byteLength).toBe(BANDS_PNG.byteLength);
        expect(bytes.every((byte, i) => byte === BANDS_PNG[i])).toBe(true);
      });
    });

    test('bytes that are no PNG, JPEG or PDF are refused, and nothing is written', async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'sig', { box: BANDS_BOX }, true);
        const before = await drawn(doc, await rowOf(doc, 'sig'));
        const unknown = new TextEncoder().encode('GIF89a: not a format a mark is read from');

        const refused = await refusalOf(doc.forms.setSignatureAppearance(field.ref, unknown));
        expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
        expect((refused as EngineError).message).toMatch(/PNG, JPEG or one-page PDF bytes/);

        const asOp = await refusalOf(
          doc.apply({
            ops: [{ type: 'forms.setSignatureAppearance', field: field.ref, appearance: unknown }],
          }),
        );
        expect(EngineError.is(asOp, EngineErrorCode.InvalidArg)).toBe(true);

        const row = await rowOf(doc, 'sig');
        expect(row.hasMark).toBe(false);
        expect(maxDifference(await drawn(doc, row), before)).toBe(0);
      });
    });

    test('`{ pdf }` takes a PDF only: an image under it is refused, and nothing is written', async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'sig', { box: BANDS_BOX }, true);
        const before = await drawn(doc, await rowOf(doc, 'sig'));
        // Refused as a PDF that doesn't open, or as a part that isn't a PDF.
        const refusedAsNoPdf = (error: unknown) =>
          EngineError.is(error, EngineErrorCode.MalformedPdf) ||
          EngineError.is(error, EngineErrorCode.InvalidArg);

        for (const image of [BANDS_PNG, BANDS_JPEG]) {
          const refused = await refusalOf(
            doc.forms.setSignatureAppearance(field.ref, { pdf: image }),
          );
          expect(refusedAsNoPdf(refused)).toBe(true);
          const asOp = await refusalOf(
            doc.apply({
              ops: [
                {
                  type: 'forms.setSignatureAppearance',
                  field: field.ref,
                  appearance: { pdf: image },
                },
              ],
            }),
          );
          expect(refusedAsNoPdf(asOp)).toBe(true);
        }
        if (doc.signatures) {
          const prepared = await refusalOf(
            doc.signatures.prepare({ field: field.ref, appearance: { pdf: BANDS_PNG } }),
          );
          expect(refusedAsNoPdf(prepared)).toBe(true);
        }

        const row = await rowOf(doc, 'sig');
        expect(row.hasMark).toBe(false);
        expect(maxDifference(await drawn(doc, row), before)).toBe(0);
        // The same image as its bytes fills the field.
        await doc.forms.setSignatureAppearance(field.ref, BANDS_PNG);
        expect(showsBands(await drawn(doc, await rowOf(doc, 'sig')))).toBe(true);
      });
    });

    test('a PDF of two pages is refused, as its bytes and under `{ pdf }`', async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'sig');
        for (const mark of [TWO_PAGE_PDF, { pdf: TWO_PAGE_PDF }]) {
          const refused = await refusalOf(doc.forms.setSignatureAppearance(field.ref, mark));
          expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
          expect((refused as EngineError).message).toMatch(/2 pages/);
        }
        expect((await rowOf(doc, 'sig')).hasMark).toBe(false);
      });
    });

    test('no mark takes the mark out: the field shows its box again, and its style can change', async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'sig', { box: BANDS_BOX }, true);
        const placed = await rowOf(doc, 'sig');
        const box = await drawn(doc, placed);
        expect(shows(box, 0.5, 0.5, [0xee, 0xee, 0xee])).toBe(true);

        await doc.forms.setSignatureAppearance(field.ref, BANDS_PNG);
        const marked = await rowOf(doc, 'sig');
        expect(marked.hasMark).toBe(true);
        const locked = await refusalOf(
          doc.forms.updateWidget(marked.ref, { interiorColor: '#00aa00' }),
        );
        expect(EngineError.is(locked, EngineErrorCode.InvalidArg)).toBe(true);

        const cleared = await doc.forms.setSignatureAppearance(field.ref, null);
        expect(cleared.field.name).toBe('sig');
        expect(cleared.field.valueEntry).toEqual({ kind: 'none' });
        const empty = await rowOf(doc, 'sig');
        expect(empty).toMatchObject({
          hasMark: false,
          hasAppearance: true,
          color: '#1a1a1a',
          interiorColor: '#eeeeee',
        });
        // The box, pixel for pixel what the field drew with no mark in it.
        expect(maxDifference(await drawn(doc, empty), box)).toBe(0);

        const restyled = await doc.forms.updateWidget(empty.ref, { interiorColor: '#00aa00' });
        expect(restyled.appearance).toEqual({ action: 'regenerated', changed: true });
        expect(shows(await drawn(doc, empty), 0.5, 0.5, [0x00, 0xaa, 0x00])).toBe(true);
      });
    });

    test('undo of a clear brings the mark back, and its undo takes it out again', async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'sig', { box: BANDS_BOX }, true);
        await doc.forms.setSignatureAppearance(field.ref, BANDS_PNG);
        const marked = await drawn(doc, await rowOf(doc, 'sig'));

        const cleared = await doc.forms.setSignatureAppearance(field.ref, null);
        expect(cleared.meta.undoable).toBe(true);
        const empty = await drawn(doc, await rowOf(doc, 'sig'));

        const undo = await doc.apply({ undoOf: cleared.meta.opId });
        const back = await rowOf(doc, 'sig');
        expect(back.hasMark).toBe(true);
        expect(maxDifference(await drawn(doc, back), marked)).toBe(0);

        await doc.apply({ undoOf: undo.meta.opId });
        const again = await rowOf(doc, 'sig');
        expect(again.hasMark).toBe(false);
        expect(maxDifference(await drawn(doc, again), empty)).toBe(0);
      });
    });

    test('a mark and no mark travel as ops of one change, which one undo takes back', async () => {
      await withDoc(async (doc) => {
        const first = await signatureField(doc, 'first', { box: BANDS_BOX }, true);
        const second = await signatureField(doc, 'second', { box: { ...BANDS_BOX, y: 120 } }, true);
        await doc.forms.setSignatureAppearance(first.ref, BANDS_PNG);

        const swapped = await doc.apply({
          ops: [
            { type: 'forms.setSignatureAppearance', field: first.ref, appearance: null },
            { type: 'forms.setSignatureAppearance', field: second.ref, appearance: BANDS_JPEG },
          ],
        });
        expect(swapped.items.map((item) => item.type)).toEqual([
          'forms.setSignatureAppearance',
          'forms.setSignatureAppearance',
        ]);
        expect((await rowOf(doc, 'first')).hasMark).toBe(false);
        const marked = await rowOf(doc, 'second');
        expect(marked.hasMark).toBe(true);
        expect(showsBands(await drawn(doc, marked))).toBe(true);

        await doc.apply({ undoOf: swapped.meta.opId });
        expect((await rowOf(doc, 'first')).hasMark).toBe(true);
        expect((await rowOf(doc, 'second')).hasMark).toBe(false);
      });
    });

    test('no mark in a field that has none changes nothing', async () => {
      await withDoc(async (doc) => {
        const field = await signatureField(doc, 'sig', { box: BANDS_BOX }, true);
        const before = await rowOf(doc, 'sig');
        const box = await drawn(doc, before);

        const cleared = await doc.forms.setSignatureAppearance(field.ref, null);
        expect(cleared.field.name).toBe('sig');
        const after = await rowOf(doc, 'sig');
        expect(after.hasMark).toBe(false);
        expect(maxDifference(await drawn(doc, after), box)).toBe(0);
      });
    });

    test('a field with two boxes is filled and cleared in both', async () => {
      await withDoc(async (doc) => {
        const { field } = await doc.forms.create({
          kind: 'signature',
          name: 'twice',
          widgets: [
            { page: PAGE, box: BANDS_BOX, interiorColor: '#eeeeee' },
            { page: PAGE, box: { ...BANDS_BOX, y: 120 }, interiorColor: '#eeeeee' },
          ],
        });
        await doc.forms.setSignatureAppearance(field.ref, BANDS_PNG);
        const marked = await rowsOf(doc, 'twice');
        expect(marked.map((row) => row.hasMark)).toEqual([true, true]);
        for (const row of marked) expect(showsBands(await drawn(doc, row))).toBe(true);

        await doc.forms.setSignatureAppearance(field.ref, null);
        const empty = await rowsOf(doc, 'twice');
        expect(empty.map((row) => row.hasMark)).toEqual([false, false]);
        for (const row of empty) {
          expect(shows(await drawn(doc, row), 0.5, 0.5, [0xee, 0xee, 0xee])).toBe(true);
        }
      });
    });

    test('a field of another family takes no mark and gives none up', async () => {
      await withDoc(async (doc) => {
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'text',
          widgets: [{ page: PAGE, box: BANDS_BOX }],
        });
        for (const mark of [BANDS_PNG, null]) {
          const refused = await refusalOf(doc.forms.setSignatureAppearance(field.ref, mark));
          expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
        }
      });
    });

    test('a signing takes an image as its mark, and a signed field keeps it', async () => {
      await withDoc(async (doc) => {
        // An engine that doesn't sign has no signing to give a mark to.
        if (!doc.signatures) return;
        const field = await signatureField(doc, 'signed');
        const prepared = await doc.signatures.prepare({
          field: field.ref,
          signer: { name: 'Signer' },
          appearance: BANDS_PNG,
        });
        if (options.completesSignings === false) {
          await doc.signatures.cancel(prepared.signingId);
          return;
        }
        await doc.signatures.complete({
          signingId: prepared.signingId,
          cms: PLACEHOLDER_CMS,
          expectedVersion: prepared.expectedVersion,
        });
        const row = await rowOf(doc, 'signed');
        expect(row.hasMark).toBe(true);
        expect(showsBands(await drawn(doc, row))).toBe(true);

        // Its mark is sealed with the signature: it takes no other, and gives none up.
        for (const mark of [BANDS_JPEG, null]) {
          const refused = await refusalOf(doc.forms.setSignatureAppearance(field.ref, mark));
          expect(EngineError.is(refused, EngineErrorCode.ProtectedDocument)).toBe(true);
        }
        expect(showsBands(await drawn(doc, await rowOf(doc, 'signed')))).toBe(true);
      });
    });

    test('a signing refuses bytes that are no PNG, JPEG or PDF', async () => {
      await withDoc(async (doc) => {
        if (!doc.signatures) return;
        const field = await signatureField(doc, 'sig');
        const refused = await refusalOf(
          doc.signatures.prepare({
            field: field.ref,
            appearance: new TextEncoder().encode('GIF89a: not a format a mark is read from'),
          }),
        );
        expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
        expect((refused as EngineError).message).toMatch(/PNG, JPEG or one-page PDF bytes/);
      });
    });
  });
}
