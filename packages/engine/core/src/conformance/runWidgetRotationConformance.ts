import { appearanceRaster, maxShiftedDifference, quarterTurned } from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { TWO_PAGES_PDF } from './runFormTransferConformance';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef } from '../identity/PageRef';

/**
 * A widget turns as a box kind does: `box` is the frame its contents are
 * laid out in, `rotation` a quarter turn, clockwise (`/MK /R`, which the
 * file holds counterclockwise), and `rect` where it stands on the page, the
 * box turned. On both engines: Acrobat's turned fields read so, a placement
 * turns a new field, an update turns, moves and resizes one, undo puts it
 * back, a form bundle carries the turn, and a mark in a signature field is
 * fitted into the frame and turns with it.
 *
 * It runs on {@link TURNED_FIELDS_PDF}.
 */

export interface WidgetRotationConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh document of `bytes` with every scope. */
  open: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
  /**
   * Whether a signing completes on this engine with a placeholder CMS, so
   * a signed field's mark can be turned. Default `true`.
   */
  completesSignings?: boolean;
}

const field = (name: string, rect: string, mk: string, page = 3) =>
  `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /V (${name}) /Rect [${rect}] ` +
  `${mk} /P ${page} 0 R >>`;

/**
 * Two 300 × 300 pages: the first upright (3), the second shown turned 90°
 * (`/Rotate 90`, page 4). Text fields with `/MK /R` as Acrobat writes it,
 * counterclockwise: `upright` (none), `r90` (90, the text runs up the page),
 * `r180`, `r270`, `odd` (45, which no viewer draws turned), `negative`
 * (-90, the same turn as 270), and `on-turned` on the turned page (90: an
 * upright field there, as Acrobat adds one).
 */
export const TURNED_FIELDS_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [6 0 R 7 0 R 8 0 R 9 0 R 10 0 R ' +
    '11 0 R 12 0 R] /DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv << /Type /Font /Subtype /Type1 ' +
    '/BaseFont /Helvetica >> >> >> >> >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 5 0 R /Resources << >> ' +
    '/Annots [6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Rotate 90 /Contents 5 0 R ' +
    '/Resources << >> /Annots [12 0 R] >>',
  '<< /Length 0 >>\nstream\n\nendstream',
  field('upright', '20 260 180 284', ''),
  field('r90', '20 20 44 180', '/MK << /R 90 >>'),
  field('r180', '60 220 220 244', '/MK << /R 180 >>'),
  field('r270', '250 20 274 180', '/MK << /R 270 >>'),
  field('odd', '60 180 220 204', '/MK << /R 45 >>'),
  field('negative', '200 20 224 180', '/MK << /R -90 >>'),
  field('on-turned', '20 20 44 180', '/MK << /R 90 >>', 4),
]);

const FIRST = toPageRef(3);

const MARK_DRAWING = '1 0 0 rg 0 0 40 40 re f 0 0 1 rg 40 30 80 10 re f';

/**
 * A one-page PDF to draw into a signature field, 120 × 40: red over its left
 * third, a blue bar along the rest of its top edge. Turned any way it looks
 * like no other turn of it.
 */
const MARK_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 40] /Contents 4 0 R >>',
  `<< /Length ${MARK_DRAWING.length} >>\nstream\n${MARK_DRAWING}\nendstream`,
]);

/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

/** The frame of a signature field as wide and as tall as the mark. */
const MARK_FRAME: PageBox = { x: 150, y: 20, width: 120, height: 40 };

/** `box` with its sides swapped about its middle: where it stands turned a quarter. */
const swapped = (box: PageBox): PageBox => ({
  x: box.x + (box.width - box.height) / 2,
  y: box.y + (box.height - box.width) / 2,
  width: box.height,
  height: box.width,
});

export function runWidgetRotationConformance(
  runner: ConformanceTestRunner,
  options: WidgetRotationConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`widget rotation conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDoc = async (
      body: (doc: DocumentHandle) => Promise<void>,
      bytes: Uint8Array = TURNED_FIELDS_PDF,
    ) => {
      const doc = await options.open(engine, bytes.slice());
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    /** The row of the first widget of field `name`. */
    const rowOf = async (doc: DocumentHandle, name: string): Promise<WidgetAnnotation> => {
      const { fields, widgets } = await doc.forms.list();
      const field = fields.find((f) => f.name === name);
      const ref = field?.widgets[0]?.ref;
      const row = ref && widgets.find((w) => annotationKey(w.ref) === annotationKey(ref));
      if (!row) throw new Error(`no widget of '${name}'`);
      return row;
    };

    const expectBox = (actual: PageBox, expected: PageBox) => {
      for (const edge of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(actual[edge] - expected[edge]) < 0.01).toBe(true);
      }
    };

    const refusalOf = (attempt: Promise<unknown>) =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );

    /** A new signature field with the mark drawn into it; its widget's row. */
    const markedField = async (
      doc: DocumentHandle,
      name: string,
      placement: { box: PageBox; rotation?: 90 | 180 | 270 },
    ): Promise<WidgetAnnotation> => {
      const { field } = await doc.forms.create({
        kind: 'signature',
        name,
        widgets: [{ page: FIRST, ...placement }],
      });
      await doc.forms.setSignatureAppearance(field.ref, { pdf: MARK_PDF });
      return rowOf(doc, name);
    };

    /** The widget as the page shows it: the pixels of its appearance. */
    const drawn = (doc: DocumentHandle, row: WidgetAnnotation) =>
      appearanceRaster(doc.page(FIRST), row.ref, 'forms');

    test('/MK /R reads as the clockwise turn, with the box it turns; rect is where it stands', async () => {
      await withDoc(async (doc) => {
        const turns: Record<string, number | null> = {};
        for (const name of ['upright', 'r90', 'r180', 'r270', 'odd', 'negative', 'on-turned']) {
          turns[name] = (await rowOf(doc, name)).rotation;
        }
        expect(turns).toEqual({
          upright: null,
          r90: 270,
          r180: 180,
          r270: 90,
          odd: null,
          negative: 90,
          'on-turned': 270,
        });
        const r90 = await rowOf(doc, 'r90');
        // /Rect [20 20 44 180] on a 300-high page: 24 wide, 160 tall, from the top-left.
        expectBox(r90.rect, { x: 20, y: 120, width: 24, height: 160 });
        expectBox(r90.box, swapped(r90.rect));
        const r180 = await rowOf(doc, 'r180');
        expectBox(r180.box, r180.rect);
      });
    });

    test('a turned field fills and saves with its turn', async () => {
      let bytes: Uint8Array | null = null;
      await withDoc(async (doc) => {
        const name = (await doc.forms.list()).fields.find((f) => f.name === 'r90')!;
        await doc.forms.setValue(name.ref, { value: 'Turned' });
        bytes = await doc.download();
      });
      await withDoc(async (doc) => {
        const row = await rowOf(doc, 'r90');
        expect(row.rotation).toBe(270);
        expectBox(row.rect, { x: 20, y: 120, width: 24, height: 160 });
        const field = (await doc.forms.list()).fields.find((f) => f.name === 'r90')!;
        expect(field).toMatchObject({ value: 'Turned' });
      }, bytes!);
    });

    test("a placement's rotation turns a new field's contents inside its rect", async () => {
      await withDoc(async (doc) => {
        const rect = { x: 100, y: 40, width: 24, height: 160 };
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'side',
          widgets: [{ page: FIRST, rect, rotation: 270 }],
        });
        const row = await rowOf(doc, field.name);
        expect(row.rotation).toBe(270);
        expectBox(row.rect, rect);
        expectBox(row.box, swapped(rect));

        const refused = await refusalOf(
          doc.forms.create({
            kind: 'text',
            name: 'tilted',
            widgets: [{ page: FIRST, rect, rotation: 45 as never }],
          }),
        );
        expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
      });
    });

    test('a placement gives where the widget stands or its frame: the same widget either way', async () => {
      await withDoc(async (doc) => {
        const rect = { x: 150, y: 40, width: 24, height: 160 };
        const { field } = await doc.forms.create({
          kind: 'text',
          name: 'by-box',
          widgets: [{ page: FIRST, box: swapped(rect), rotation: 270 }],
        });
        const row = await rowOf(doc, field.name);
        expect(row.rotation).toBe(270);
        expectBox(row.rect, rect);
        expectBox(row.box, swapped(rect));

        const neither = await refusalOf(
          doc.forms.create({ kind: 'text', name: 'nowhere', widgets: [{ page: FIRST }] }),
        );
        expect(EngineError.is(neither, EngineErrorCode.InvalidArg)).toBe(true);
      });
    });

    test('a turn turns the widget about its middle; a new box with it keeps the widget in place', async () => {
      await withDoc(async (doc) => {
        const before = await rowOf(doc, 'upright');
        const turned = await doc.forms.updateWidget(before.ref, { rotation: 90 });
        expect(turned.widget.rotation).toBe(90);
        expectBox(turned.widget.box, before.box);
        expectBox(turned.widget.rect, swapped(before.rect));

        // Acrobat's Orientation: the text turns, the footprint stays.
        const oriented = await doc.forms.updateWidget(before.ref, {
          rotation: 270,
          box: swapped(before.rect),
        });
        expect(oriented.widget.rotation).toBe(270);
        expectBox(oriented.widget.rect, before.rect);

        const straight = await doc.forms.updateWidget(before.ref, { rotation: null });
        expect(straight.widget.rotation).toBe(null);
      });
    });

    test('rect moves and resizes a quarter-turned widget; its turn stays', async () => {
      await withDoc(async (doc) => {
        const row = await rowOf(doc, 'r90');
        const rect = { x: 30, y: 60, width: 40, height: 200 };
        const { widget } = await doc.forms.updateWidget(row.ref, { rect });
        expect(widget.rotation).toBe(270);
        expectBox(widget.rect, rect);
        expectBox(widget.box, swapped(rect));
      });
    });

    test("a widget's turn is a quarter turn: another is refused", async () => {
      await withDoc(async (doc) => {
        const row = await rowOf(doc, 'upright');
        const refused = await refusalOf(doc.forms.updateWidget(row.ref, { rotation: 45 as never }));
        expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
        expect((await rowOf(doc, 'upright')).rotation).toBe(null);
      });
    });

    test('undo puts a turn back, and redo turns it again', async () => {
      await withDoc(async (doc) => {
        const row = await rowOf(doc, 'r180');
        const turned = await doc.forms.updateWidget(row.ref, { rotation: 90 });
        const undo = await doc.apply({ undoOf: turned.meta.opId });
        const back = await rowOf(doc, 'r180');
        expect(back.rotation).toBe(180);
        expectBox(back.rect, row.rect);
        await doc.apply({ undoOf: undo.meta.opId });
        expect((await rowOf(doc, 'r180')).rotation).toBe(90);
      });
    });

    test('a mark drawn into a turned signature field is fitted into its frame and turned with it', async () => {
      await withDoc(async (doc) => {
        const upright = await drawn(doc, await markedField(doc, 'plain', { box: MARK_FRAME }));
        const turned = await markedField(doc, 'turned', {
          box: { ...MARK_FRAME, y: 120 },
          rotation: 90,
        });
        expect(turned.hasMark).toBe(true);
        expectBox(turned.rect, swapped(turned.box));
        const raster = await drawn(doc, turned);
        expect([raster.width, raster.height]).toEqual([upright.height, upright.width]);
        expect(maxShiftedDifference(raster, quarterTurned(upright)) <= 3).toBe(true);
      });
    });

    test('a turn turns the mark in a field, a new frame fits it again, and undo puts it back', async () => {
      await withDoc(async (doc) => {
        const row = await markedField(doc, 'marked', { box: MARK_FRAME });
        const upright = await drawn(doc, row);

        const turned = await doc.forms.updateWidget(row.ref, { rotation: 90 });
        expect(turned.appearance.changed).toBe(true);
        expect(turned.widget.hasMark).toBe(true);
        expect(maxShiftedDifference(await drawn(doc, row), quarterTurned(upright)) <= 3).toBe(true);

        // Acrobat's Orientation: the frame swaps its sides where the widget
        // stands. The mark is fitted into it as into a new field's.
        const oriented = await doc.forms.updateWidget(row.ref, {
          rotation: null,
          box: turned.widget.rect,
        });
        const fresh = await markedField(doc, 'fresh', {
          box: { ...turned.widget.rect, x: 40 },
        });
        expect(maxShiftedDifference(await drawn(doc, row), await drawn(doc, fresh)) <= 3).toBe(
          true,
        );

        await doc.apply({ undoOf: oriented.meta.opId });
        await doc.apply({ undoOf: turned.meta.opId });
        expect((await rowOf(doc, 'marked')).rotation).toBe(null);
        expect(maxShiftedDifference(await drawn(doc, row), upright) <= 3).toBe(true);
      });
    });

    test("a signed field's mark turns with it as well", async () => {
      if (options.completesSignings === false) return;
      await withDoc(async (doc) => {
        // An engine that doesn't sign has no signed field to turn.
        if (!doc.signatures) return;
        const { field } = await doc.forms.create({
          kind: 'signature',
          name: 'signed',
          widgets: [{ page: FIRST, box: MARK_FRAME }],
        });
        const prepared = await doc.signatures.prepare({
          field: field.ref,
          signer: { name: 'Signer' },
          appearance: { pdf: MARK_PDF },
        });
        await doc.signatures.complete({
          signingId: prepared.signingId,
          cms: PLACEHOLDER_CMS,
          expectedVersion: prepared.expectedVersion,
        });
        const row = await rowOf(doc, 'signed');
        expect(row.hasMark).toBe(true);
        const upright = await drawn(doc, row);

        await doc.forms.updateWidget(row.ref, { rotation: 90 });
        expect(maxShiftedDifference(await drawn(doc, row), quarterTurned(upright)) <= 3).toBe(true);
      });
    });

    test('a form bundle carries the turn', async () => {
      let bundle: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await withDoc(async (doc) => {
        bundle = await doc.forms.export({ pages: [FIRST] });
      });
      await withDoc(async (copy) => {
        await copy.forms.import(bundle!, { attribution: 'stamp' });
        for (const name of ['upright', 'r90', 'r180', 'r270']) {
          const first = bundle!.fields.find((f) => f.data.name === name)!.data.widgets[0]!;
          const source = bundle!.widgets.find(
            ({ data }) => annotationKey(data.ref) === annotationKey(first.ref!),
          )!.data;
          const row = await rowOf(copy, name);
          expect({ name, rotation: row.rotation }).toEqual({ name, rotation: source.rotation });
          expectBox(row.rect, source.rect);
        }
      }, TWO_PAGES_PDF);
    });
  });
}
