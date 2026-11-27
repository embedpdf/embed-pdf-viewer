import { appearanceRaster, type Raster } from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_JPEG, BANDS_PDF, BANDS_PNG, TWO_PAGE_PDF } from './stampFixtures';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { WidgetLayout } from '../annotation/primitives';
import type { Identity } from '../auth/scope/types';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { FormField } from '../forms/field';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { toPageRef } from '../identity/PageRef';

/**
 * A push button that holds a picture, an image field as Acrobat makes one,
 * the same on every engine:
 *   - each of its widgets has a `layout` (`/MK /TP`): its caption alone, its
 *     picture alone, or both. All seven of the file's values read, and a
 *     create and a widget update write any of them;
 *   - the field reads `hasImage`: one of its widgets has an icon (`/MK /I`);
 *   - `doc.forms.setButtonImage` puts a PNG, a JPEG or a one-page PDF in every
 *     widget of the field, or takes it out, as one change with one undo
 *     step. It is filling in: the fill right for the field's group, refused
 *     on a field a signature locked;
 *   - the picture is a drawing the document holds once, however many push
 *     buttons, signature fields and stamps show it, and a copy, an export
 *     and an import carry it. An export leaves it out of a field the form
 *     doesn't export, as it leaves out a value.
 *
 * It runs on {@link PICTURE_BUTTON_PDF}.
 */

/** The bands of the stamp fixtures, 30 × 10, as a form XObject: what another app's icon is. */
const ICON_CONTENT = '1 0 0 rg 0 0 10 10 re f 0 1 0 rg 10 0 10 10 re f 0 0 1 rg 20 0 10 10 re f';
/** An icon-only button's look as such an app draws it: the icon, three times its size. */
const ICON_LOOK = 'q 3 0 0 3 0 0 cm /FRM Do Q';

/** A field of the fixture: its name, what makes it its kind, and the rest of its dictionary. */
interface FixtureField {
  readonly name: string;
  /** `/FT` and its flags: a push button when left out. */
  readonly family?: string;
  readonly extra?: string;
}

const BUTTON = '/FT /Btn /Ff 65536';
const group = (name: string) => `/EMBD_Metadata << /SchemaVersion 1 /GroupID (${name}) >>`;
const caption = (position: number | null) =>
  `/MK << /CA (Go)${position === null ? '' : ` /TP ${position}`} >>`;

/** The object number of the fixture's first field; the icon and its look come before it. */
const FIRST_FIELD = 7;

const FIXTURE_FIELDS: readonly FixtureField[] = [
  // An image field as the standard describes one: icon only, the icon in
  // `/MK /I`, and a look that draws it.
  { name: 'acrobat_image', extra: '/MK << /TP 1 /I 5 0 R >> /AP << /N 6 0 R >>' },
  { name: 'layout_none', extra: caption(null) },
  ...[0, 1, 2, 3, 4, 5, 6].map((position) => ({
    name: `layout_${position}`,
    extra: caption(position),
  })),
  // A number outside the table reads as the caption alone, as it is drawn.
  { name: 'layout_odd', extra: caption(9) },
  { name: 'buyer_initials', extra: `/MK << /TP 1 >> ${group('buyer')}` },
  { name: 'seller_initials', extra: `/MK << /TP 1 >> ${group('seller')}` },
  { name: 'buyer_sig', family: '/FT /Sig', extra: group('buyer') },
  { name: 'text_field', family: '/FT /Tx' },
  { name: 'sig_field', family: '/FT /Sig' },
];

/** The layout each widget of the fixture reads. */
const FIXTURE_LAYOUTS: Readonly<Record<string, WidgetLayout | null>> = {
  acrobat_image: 'image',
  layout_none: 'caption',
  layout_0: 'caption',
  layout_1: 'image',
  layout_2: 'caption-below',
  layout_3: 'caption-above',
  layout_4: 'caption-right',
  layout_5: 'caption-left',
  layout_6: 'caption-over',
  layout_odd: 'caption',
  buyer_initials: 'image',
  seller_initials: 'image',
  buyer_sig: null,
  text_field: null,
  sig_field: null,
};

/**
 * One page of fields, each 90 × 30 in the left column: an image field made
 * as the standard describes it, push buttons in every layout and one past
 * the table, two image fields in groups, a grouped signature field, a text
 * field and a signature field. The right column is free for what a test
 * places.
 */
export const PICTURE_BUTTON_PDF = (() => {
  const refs = FIXTURE_FIELDS.map((_, at) => `${FIRST_FIELD + at} 0 R`).join(' ');
  const fields = FIXTURE_FIELDS.map((field, at) => {
    const top = 770 - at * 34;
    return (
      `<< /Type /Annot /Subtype /Widget ${field.family ?? BUTTON} /T (${field.name}) ` +
      `/Rect [40 ${top - 30} 130 ${top}] /F 4 /P 3 0 R /DA (/Helv 10 Tf 0 g)` +
      (field.extra ? ` ${field.extra}` : '') +
      ' >>'
    );
  });
  return pdfOf([
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${refs}] /DA (/Helv 10 Tf 0 g) ` +
      '/DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      `/Resources << >> /Annots [${refs}] >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
    `<< /Type /XObject /Subtype /Form /BBox [0 0 30 10] /Resources << >> /Length ${ICON_CONTENT.length} >>\nstream\n${ICON_CONTENT}\nendstream`,
    `<< /Type /XObject /Subtype /Form /BBox [0 0 90 30] /Resources << /XObject << /FRM 5 0 R >> >> /Length ${ICON_LOOK.length} >>\nstream\n${ICON_LOOK}\nendstream`,
    ...fields,
  ]);
})();

/** The tokens the suite opens the fixture with. */
export const PICTURE_BUTTON_TOKENS = {
  everything: { scope: ['*'], identity: {} },
  /** Fills in and signs the buyer's fields, and nothing else. */
  buyer: {
    scope: ['doc.open', 'doc.render', 'fields:fill:group=buyer', 'fields:sign:group=buyer'],
    identity: { userId: 'alice', displayName: 'Alice' },
  },
  /** Fills in any field. */
  filler: { scope: ['doc.open', 'doc.render', 'doc.forms.fill'], identity: {} },
  /** Reads the form. */
  reader: { scope: ['doc.open', 'doc.render', 'doc.forms.read'], identity: {} },
} as const satisfies Record<string, { scope: readonly string[]; identity: Identity }>;

export type PictureButtonToken = keyof typeof PICTURE_BUTTON_TOKENS;

export interface PictureButtonConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `bytes` (default {@link PICTURE_BUTTON_PDF}) with `scope`, acting for `identity`. */
  open: (
    engine: Engine,
    scope: readonly string[],
    identity: Identity,
    bytes?: Uint8Array,
  ) => Promise<DocumentHandle>;
  /**
   * Whether a signing completes on this engine with a placeholder CMS, so
   * the lock it installs can be tried. Default `true`.
   */
  completesSignings?: boolean;
}

const PAGE = toPageRef(3);
const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });
/** A free box in the right column, as wide as the bands are, three to one. */
const box = (row: number): PageBox => ({ x: 300, y: 40 + row * 40, width: 90, height: 30 });

/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

type Rgb = readonly [number, number, number];
const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const BLUE: Rgb = [0, 0, 255];

/** How many image XObjects a saved file holds, each counted once. */
const imagesIn = (pdf: Uint8Array): number =>
  (new TextDecoder('latin1').decode(pdf).match(/\/Subtype\s*\/Image\b/g) ?? []).length;

export function runPictureButtonConformance(
  runner: ConformanceTestRunner,
  options: PictureButtonConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`picture button conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const as = async (
      token: PictureButtonToken,
      body: (doc: DocumentHandle) => Promise<void>,
      bytes?: Uint8Array,
    ) => {
      const { scope, identity } = PICTURE_BUTTON_TOKENS[token];
      const doc = await options.open(engine, scope, identity, bytes);
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    const refusal = (attempt: Promise<unknown>): Promise<unknown> =>
      attempt.then(
        () => null,
        (error: unknown) => error,
      );
    const codeOf = (error: unknown) =>
      EngineError.is(error) ? error.code : error === null ? 'resolved' : String(error);
    /** The code a write is refused with, or `'resolved'`. */
    const refused = async (attempt: Promise<unknown>) => codeOf(await refusal(attempt));

    /** A field's `hasImage`; `undefined` for a kind that has none. */
    const hasImageOf = (field: FormField) =>
      field.kind === 'pushbutton' ? field.hasImage : undefined;
    const read = (doc: DocumentHandle, name: string) => doc.forms.get(named(name));

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

    /** The widget as the page shows it: the pixels of its appearance. */
    const drawn = (doc: DocumentHandle, row: WidgetAnnotation) =>
      appearanceRaster(doc.page(PAGE), row.ref, 'forms');

    /** Whether the pixel at a share of each side is drawn in `color`, give or take what a JPEG loses. */
    const shows = (raster: Raster, x: number, y: number, color: Rgb) => {
      const column = Math.min(raster.width - 1, Math.floor(raster.width * x));
      const row = Math.min(raster.height - 1, Math.floor(raster.height * y));
      const at = (row * raster.width + column) * 4;
      const [r, g, b, alpha] = raster.rgba.subarray(at, at + 4);
      return alpha! > 200 && [r, g, b].every((channel, i) => Math.abs(channel! - color[i]!) <= 40);
    };
    /** Whether the three bands fill the raster from side to side, at half its height. */
    const showsBands = (raster: Raster) =>
      shows(raster, 1 / 6, 0.5, RED) &&
      shows(raster, 3 / 6, 0.5, GREEN) &&
      shows(raster, 5 / 6, 0.5, BLUE);
    /** Whether any of the three bands shows where it would. */
    const showsAnyBand = (raster: Raster) =>
      shows(raster, 1 / 6, 0.5, RED) ||
      shows(raster, 3 / 6, 0.5, GREEN) ||
      shows(raster, 5 / 6, 0.5, BLUE);

    /** Every widget of field `name` shows the bands. */
    const allShowBands = async (doc: DocumentHandle, name: string) => {
      const rows = await rowsOf(doc, name);
      const shown = await Promise.all(rows.map(async (row) => showsBands(await drawn(doc, row))));
      return rows.length > 0 && shown.every(Boolean);
    };

    /** A new push button with a widget per layout given, each in its own free box. */
    const button = async (
      doc: DocumentHandle,
      name: string,
      layouts: readonly WidgetLayout[],
      first = 0,
    ): Promise<FormField> => {
      const { field } = await doc.forms.create({
        kind: 'pushbutton',
        name,
        widgets: layouts.map((layout, at) => ({ page: PAGE, box: box(first + at), layout })),
      });
      return field;
    };

    /* ── reading ──────────────────────────────────────────────────────────── */

    test('a widget reads its layout from the file: all seven, the default, and one past them', async () => {
      await as('reader', async (doc) => {
        const { fields, widgets } = await doc.forms.list();
        const layouts = Object.fromEntries(
          fields.map((field) => {
            const row = widgets.find(
              (w) => annotationKey(w.ref) === annotationKey(field.widgets[0]!.ref!),
            )!;
            return [field.name, row.layout];
          }),
        );
        expect(layouts).toEqual(FIXTURE_LAYOUTS);
      });
    });

    test('a push button reads whether it holds a picture; another kind has no such fact', async () => {
      await as('reader', async (doc) => {
        const { fields } = await doc.forms.list();
        const pictures = Object.fromEntries(fields.map((field) => [field.name, hasImageOf(field)]));
        expect(pictures).toMatchObject({
          acrobat_image: true,
          layout_none: false,
          layout_1: false,
          buyer_initials: false,
          text_field: undefined,
          sig_field: undefined,
        });
        expect('hasImage' in fields.find((field) => field.name === 'text_field')!).toBe(false);
      });
    });

    test("another app's icon shows, and exports as a one-page PDF", async () => {
      await as('everything', async (doc) => {
        expect(await allShowBands(doc, 'acrobat_image')).toBe(true);
        const bundle = await doc.forms.export({ fields: [named('acrobat_image')] });
        const id = bundle.widgets[0]!.resources.image;
        expect(id).toMatch(/^sha256-/);
        const pdf = bundle.resources[id as keyof typeof bundle.resources]!;
        expect(new TextDecoder('latin1').decode(pdf.subarray(0, 5))).toBe('%PDF-');
      });
    });

    /* ── the layout ───────────────────────────────────────────────────────── */

    test('a create and a widget update write any layout, and a save keeps it', async () => {
      let saved: Uint8Array | null = null;
      await as('everything', async (doc) => {
        const all: WidgetLayout[] = [
          'caption',
          'image',
          'caption-below',
          'caption-above',
          'caption-right',
          'caption-left',
          'caption-over',
        ];
        await button(doc, 'made', all);
        expect((await rowsOf(doc, 'made')).map((row) => row.layout)).toEqual(all);
        // Left out, a button's widget shows its caption alone.
        await doc.forms.create({
          kind: 'pushbutton',
          name: 'plain',
          widgets: [{ page: PAGE, box: box(8) }],
        });
        expect((await rowsOf(doc, 'plain'))[0]!.layout).toBe('caption');

        const [first] = await rowsOf(doc, 'made');
        const { widget } = await doc.forms.updateWidget(first!.ref, { layout: 'caption-left' });
        expect(widget.layout).toBe('caption-left');
        saved = await doc.download();
      });
      await as(
        'reader',
        async (doc) => {
          expect((await rowsOf(doc, 'made')).map((row) => row.layout)).toEqual([
            'caption-left',
            'image',
            'caption-below',
            'caption-above',
            'caption-right',
            'caption-left',
            'caption-over',
          ]);
        },
        saved!,
      );
    });

    test('a layout goes on a push button only, and a push button always has one', async () => {
      await as('everything', async (doc) => {
        expect(
          await refused(
            doc.forms.create({
              kind: 'text',
              name: 'laid_out_text',
              widgets: [{ page: PAGE, box: box(0), layout: 'image' }],
            }),
          ),
        ).toBe(EngineErrorCode.InvalidArg);
        const [text] = await rowsOf(doc, 'text_field');
        expect(await refused(doc.forms.updateWidget(text!.ref, { layout: 'image' }))).toBe(
          EngineErrorCode.InvalidArg,
        );
        // The `null` a text field's row reads, sent back, is no change.
        expect(await refused(doc.forms.updateWidget(text!.ref, { layout: null }))).toBe('resolved');
        const [plain] = await rowsOf(doc, 'layout_none');
        expect(await refused(doc.forms.updateWidget(plain!.ref, { layout: null }))).toBe(
          EngineErrorCode.InvalidArg,
        );
        expect((await rowsOf(doc, 'layout_none'))[0]!.layout).toBe('caption');
      });
    });

    /* ── the picture ──────────────────────────────────────────────────────── */

    for (const [format, bytes] of [
      ['PNG', BANDS_PNG],
      ['JPEG', BANDS_JPEG],
      ['one-page PDF', BANDS_PDF],
    ] as const) {
      test(`a ${format} becomes the picture of every widget of the field`, async () => {
        await as('everything', async (doc) => {
          const field = await button(doc, 'initials', ['image', 'image']);
          expect(hasImageOf(field)).toBe(false);
          const { field: filled, widgets } = await doc.forms.setButtonImage(field.ref, bytes);
          expect(hasImageOf(filled)).toBe(true);
          expect(widgets.map((row) => row.layout)).toEqual(['image', 'image']);
          expect(hasImageOf(await read(doc, 'initials'))).toBe(true);
          if (format === 'one-page PDF') {
            // The PDF's red and blue bands, two to one, fitted whole in the
            // middle of the box (88 × 28 inside the border): 56 wide, from 17 to 73.
            const [row] = await rowsOf(doc, 'initials');
            const raster = await drawn(doc, row!);
            expect(shows(raster, 0.35, 0.5, RED)).toBe(true);
            expect(shows(raster, 0.7, 0.5, BLUE)).toBe(true);
            expect(shows(raster, 0.1, 0.5, RED) || shows(raster, 0.9, 0.5, BLUE)).toBe(false);
          } else {
            expect(await allShowBands(doc, 'initials')).toBe(true);
          }
        });
      });
    }

    test('null takes the picture out, and a field with none is left as it is', async () => {
      await as('everything', async (doc) => {
        const field = await button(doc, 'initials', ['image']);
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        const { field: emptied } = await doc.forms.setButtonImage(field.ref, null);
        expect(hasImageOf(emptied)).toBe(false);
        const [row] = await rowsOf(doc, 'initials');
        expect(showsAnyBand(await drawn(doc, row!))).toBe(false);
        // Again: nothing to take out.
        expect(hasImageOf((await doc.forms.setButtonImage(field.ref, null)).field)).toBe(false);
        // Another app's icon comes out the same way.
        expect(
          hasImageOf((await doc.forms.setButtonImage(named('acrobat_image'), null)).field),
        ).toBe(false);
      });
    });

    test('each widget shows the picture as its layout says, which stays as it is', async () => {
      await as('everything', async (doc) => {
        const field = await button(doc, 'mixed', ['image', 'caption']);
        const { widgets } = await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        expect(widgets.map((row) => row.layout)).toEqual(['image', 'caption']);
        const [icon, captioned] = await rowsOf(doc, 'mixed');
        expect(showsBands(await drawn(doc, icon!))).toBe(true);
        // The caption-only widget keeps the picture and shows its caption alone.
        expect(showsAnyBand(await drawn(doc, captioned!))).toBe(false);
        expect(hasImageOf(await read(doc, 'mixed'))).toBe(true);
      });
    });

    test('the picture is stored once, however many buttons, signature fields and stamps show it', async () => {
      await as('everything', async (doc) => {
        for (const [at, name] of ['one', 'two', 'three'].entries()) {
          const field = await button(doc, name, ['image'], at);
          await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        }
        for (const [at, name] of ['mark_one', 'mark_two'].entries()) {
          const { field } = await doc.forms.create({
            kind: 'signature',
            name,
            widgets: [{ page: PAGE, box: box(4 + at) }],
          });
          await doc.forms.setSignatureAppearance(field.ref, BANDS_PNG);
        }
        await doc
          .page(PAGE)
          .annotations.create(
            { subtype: 'stamp', box: { x: 420, y: 40, width: 90, height: 30 } },
            { resources: { appearance: BANDS_PNG } },
          );
        expect(imagesIn(await doc.download())).toBe(1);
      });
    });

    test('it takes a push button, and a PNG, a JPEG or a one-page PDF', async () => {
      await as('everything', async (doc) => {
        for (const name of ['text_field', 'sig_field']) {
          expect(await refused(doc.forms.setButtonImage(named(name), BANDS_PNG))).toBe(
            EngineErrorCode.InvalidArg,
          );
          expect(await refused(doc.forms.setButtonImage(named(name), null))).toBe(
            EngineErrorCode.InvalidArg,
          );
        }
        expect(await refused(doc.forms.setButtonImage(named('nowhere'), BANDS_PNG))).toBe(
          EngineErrorCode.NotFound,
        );
        const notPictures = [
          TWO_PAGE_PDF,
          new TextEncoder().encode('GIF89a: not a format a picture is read from'),
        ];
        for (const bytes of notPictures) {
          expect(await refused(doc.forms.setButtonImage(named('layout_1'), bytes))).toBe(
            EngineErrorCode.InvalidArg,
          );
        }
        expect(hasImageOf(await read(doc, 'layout_1'))).toBe(false);
      });
    });

    test('it is one change: an undo takes the picture out, and its undo puts it back', async () => {
      await as('everything', async (doc) => {
        const events: DocumentEvent[] = [];
        const stop = doc.events.subscribe((event) => {
          if (event.type.startsWith('forms.')) events.push(event);
        });
        await doc.forms.setButtonImage(named('layout_1'), BANDS_PNG, { opId: 'picture-1' });
        stop();
        expect(events.map((event) => event.type)).toEqual(['forms.updated']);

        const undo = await doc.apply({ undoOf: 'picture-1' });
        expect(undo.items.map((item) => item.type)).toEqual(['forms.setButtonImage']);
        expect(hasImageOf(await read(doc, 'layout_1'))).toBe(false);
        await doc.apply({ undoOf: undo.meta.opId });
        expect(hasImageOf(await read(doc, 'layout_1'))).toBe(true);
        expect(await allShowBands(doc, 'layout_1')).toBe(true);
      });
    });

    test("it is filling in: the fill right for the field's group", async () => {
      await as('buyer', async (doc) => {
        expect(await refused(doc.forms.setButtonImage(named('buyer_initials'), BANDS_PNG))).toBe(
          'resolved',
        );
        expect(hasImageOf(await read(doc, 'buyer_initials'))).toBe(true);
        expect(await refused(doc.forms.setButtonImage(named('seller_initials'), BANDS_PNG))).toBe(
          EngineErrorCode.Forbidden,
        );
        expect(await refused(doc.forms.setButtonImage(named('layout_1'), BANDS_PNG))).toBe(
          EngineErrorCode.Forbidden,
        );
      });
      await as('filler', async (doc) => {
        expect(await refused(doc.forms.setButtonImage(named('seller_initials'), BANDS_PNG))).toBe(
          'resolved',
        );
      });
      await as('reader', async (doc) => {
        expect(await refused(doc.forms.setButtonImage(named('layout_1'), BANDS_PNG))).toBe(
          EngineErrorCode.Forbidden,
        );
      });
    });

    test('a field a signature locked takes no picture', async () => {
      if (options.completesSignings === false) return;
      await as('everything', async (doc) => {
        const prepared = await doc.signatures.prepare({ field: named('buyer_sig') });
        await doc.signatures.complete({
          signingId: prepared.signingId,
          cms: PLACEHOLDER_CMS,
          expectedVersion: prepared.expectedVersion,
        });
        // The signature locks its group: the buyer's initials, not the seller's.
        expect(await refused(doc.forms.setButtonImage(named('buyer_initials'), BANDS_PNG))).toBe(
          EngineErrorCode.ProtectedDocument,
        );
        expect(await refused(doc.forms.setButtonImage(named('seller_initials'), BANDS_PNG))).toBe(
          'resolved',
        );
      });
    });

    test('a save keeps the picture, and the file reads it again', async () => {
      let saved: Uint8Array | null = null;
      await as('everything', async (doc) => {
        await doc.forms.setButtonImage(named('layout_1'), BANDS_PNG);
        saved = await doc.download();
      });
      await as(
        'reader',
        async (doc) => {
          expect(hasImageOf(await read(doc, 'layout_1'))).toBe(true);
          expect((await rowsOf(doc, 'layout_1'))[0]!.layout).toBe('image');
          expect(await allShowBands(doc, 'layout_1')).toBe(true);
        },
        saved!,
      );
    });

    /* ── a new place ─────────────────────────────────────────────────────── */

    test("a place added later shows the field's picture, and the file holds it once", async () => {
      await as('everything', async (doc) => {
        const field = await button(doc, 'initials', ['image']);
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        const added = await doc.forms.addWidget(field.ref, {
          page: PAGE,
          box: box(1),
          layout: 'image',
        });
        expect(hasImageOf(added.field)).toBe(true);
        const rows = await rowsOf(doc, 'initials');
        expect(rows.map((row) => row.layout)).toEqual(['image', 'image']);
        expect(showsBands(await drawn(doc, rows[1]!))).toBe(true);
        expect(imagesIn(await doc.download())).toBe(1);
      });
    });

    test('a place added without a layout keeps the picture and shows its caption, as the layout says', async () => {
      await as('everything', async (doc) => {
        const field = await button(doc, 'initials', ['image']);
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        await doc.forms.addWidget(field.ref, { page: PAGE, box: box(1) });
        const [, added] = await rowsOf(doc, 'initials');
        expect(added!.layout).toBe('caption');
        expect(showsAnyBand(await drawn(doc, added!))).toBe(false);
        // It holds the picture: a layout that shows one shows it.
        await doc.forms.updateWidget(added!.ref, { layout: 'image' });
        const [, shown] = await rowsOf(doc, 'initials');
        expect(showsBands(await drawn(doc, shown!))).toBe(true);
      });
    });

    test('undoing the added place takes it away, and the picture stays in the others', async () => {
      await as('everything', async (doc) => {
        const field = await button(doc, 'initials', ['image']);
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        await doc.forms.addWidget(
          field.ref,
          { page: PAGE, box: box(1), layout: 'image' },
          { opId: 'place-2' },
        );
        await doc.apply({ undoOf: 'place-2' });
        expect(hasImageOf(await read(doc, 'initials'))).toBe(true);
        const rows = await rowsOf(doc, 'initials');
        expect(rows.length).toBe(1);
        expect(showsBands(await drawn(doc, rows[0]!))).toBe(true);
      });
    });

    test('a field and widget in one object split for a new place, and both show the picture', async () => {
      await as('everything', async (doc) => {
        await doc.forms.setButtonImage(named('layout_1'), BANDS_PNG);
        await doc.forms.addWidget(named('layout_1'), { page: PAGE, box: box(1), layout: 'image' });
        expect((await rowsOf(doc, 'layout_1')).length).toBe(2);
        expect(await allShowBands(doc, 'layout_1')).toBe(true);
        expect(imagesIn(await doc.download())).toBe(1);
      });
    });

    /* ── copies and bundles ───────────────────────────────────────────────── */

    test('a copy keeps the picture with its value, and its layout always', async () => {
      await as('everything', async (doc) => {
        const field = await button(doc, 'initials', ['image']);
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        const copied = await doc.forms.copy([field.ref], { offset: { x: 0, y: 40 } });
        expect(copied.fields.map((f) => [f.name, hasImageOf(f)])).toEqual([['initials_2', true]]);
        expect(copied.widgets.map((row) => row.layout)).toEqual(['image']);
        expect(await allShowBands(doc, 'initials_2')).toBe(true);
        const plain = await doc.forms.copy([field.ref], { offset: { x: 0, y: 80 }, values: false });
        expect(plain.fields.map((f) => [f.name, hasImageOf(f)])).toEqual([['initials_3', false]]);
        expect(plain.widgets.map((row) => row.layout)).toEqual(['image']);
        expect(imagesIn(await doc.download())).toBe(1);
      });
    });

    test('an export carries the picture once, and an import places it', async () => {
      let bundle: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        const field = await button(doc, 'initials', ['image', 'caption-below']);
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        bundle = await doc.forms.export({ fields: [field.ref] });
      });
      const exported = bundle!;
      const ids = exported.widgets.map((row) => row.resources.image);
      expect(ids.length).toBe(2);
      expect(ids[0]).toMatch(/^sha256-/);
      expect(ids[1]).toBe(ids[0]);
      expect(Object.keys(exported.resources)).toEqual([ids[0]]);
      expect(exported.widgets.map((row) => row.data.layout)).toEqual(['image', 'caption-below']);

      await as('everything', async (doc) => {
        const imported = await doc.forms.import(exported);
        expect(imported.dropped).toEqual([]);
        expect(imported.fields.map((f) => [f.name, hasImageOf(f)])).toEqual([['initials', true]]);
        expect(imported.widgets.map((row) => row.layout)).toEqual(['image', 'caption-below']);
        const [icon] = await rowsOf(doc, 'initials');
        expect(showsBands(await drawn(doc, icon!))).toBe(true);
        // The same bundle back.
        const again = await doc.forms.export({ fields: [named('initials')] });
        expect(again.widgets.map((row) => row.resources)).toEqual(
          exported.widgets.map((row) => row.resources),
        );
      });
      await as('everything', async (doc) => {
        const imported = await doc.forms.import(exported, { values: false });
        expect(imported.fields.map((f) => [f.name, hasImageOf(f)])).toEqual([['initials', false]]);
      });
    });

    test("a field the form doesn't export goes without its picture, as without a value", async () => {
      let bundle: Awaited<ReturnType<DocumentHandle['forms']['export']>> | null = null;
      await as('everything', async (doc) => {
        const { field } = await doc.forms.create({
          kind: 'pushbutton',
          name: 'photo',
          noExport: true,
          widgets: [{ page: PAGE, box: box(0), layout: 'image' }],
        });
        await doc.forms.setButtonImage(field.ref, BANDS_PNG);
        expect(hasImageOf(await read(doc, 'photo'))).toBe(true);
        bundle = await doc.forms.export({ fields: [field.ref] });
      });
      const exported = bundle!;
      expect(exported.fields.map((f) => [f.data.name, hasImageOf(f.data)])).toEqual([
        ['photo', false],
      ]);
      expect(exported.widgets.map((row) => [row.data.layout, row.resources])).toEqual([
        ['image', {}],
      ]);
      expect(exported.resources).toEqual({});
      await as('everything', async (doc) => {
        const imported = await doc.forms.import(exported);
        expect(imported.fields.map((f) => [f.name, hasImageOf(f)])).toEqual([['photo', false]]);
      });
    });
  });
}
