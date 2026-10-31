import { decodePng, type Raster } from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { PageExtractOptions } from '../dto/PageExtract';
import type { PageLayout } from '../dto/PageLayout';
import {
  PAGE_THUMBNAIL_SIZE,
  type PageImageHandle,
  type PageImageOptions,
  type PrintDpi,
} from '../dto/PageRender';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageRef } from '../identity/PageRef';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { pageTransform } from '../geometry/pageTransform';

const SQUARE = '0 g 0 0 40 40 re f';
const LAYERS = '/OC /OCp BDC 0 g 10 150 40 40 re f EMC\n/OC /OCv BDC 0 g 60 150 40 40 re f EMC';

/** An annotation drawn as a black 40 × 40 square at `rect`, with the flags `f`. */
const square = (rect: string, f: number) =>
  `<< /Type /Annot /Subtype /Square /Rect [${rect}] /F ${f} /C [0 0 0] /P 3 0 R /AP << /N 8 0 R >> >>`;

/**
 * A 200 × 200 page with one black 40 × 40 square for each print rule, and an
 * A0 page (2384 × 3370) with nothing on it:
 *
 * - a layer that only prints, and one only shown on screen (`/Usage`
 *   `/PrintState` and `/ViewState`, as Acrobat's watermarks write them);
 * - four squares: one that only prints (`noView` + `print`), one only on
 *   screen (no `print`), one on both (`print`), one on neither (`hidden`);
 * - two form fields: a push button only on screen (Acrobat's "Visible but
 *   doesn't print") and a text field that only prints ("Hidden but
 *   printable").
 */
export const PRINT_RULES_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [13 0 R 14 0 R] >> /OCProperties << /OCGs [6 0 R 7 0 R] /D << /ON [7 0 R] /OFF [6 0 R] /AS [<< /Event /Print /Category [/Print] /OCGs [6 0 R 7 0 R] >> << /Event /View /Category [/View] /OCGs [6 0 R 7 0 R] >>] >> >> >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /Resources << /Properties << /OCp 6 0 R /OCv 7 0 R >> >> /Annots [9 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2384 3370] /Resources << >> >>',
  `<< /Length ${LAYERS.length} >>\nstream\n${LAYERS}\nendstream`,
  '<< /Type /OCG /Name (Prints only) /Usage << /Print << /PrintState /ON >> /View << /ViewState /OFF >> >> >>',
  '<< /Type /OCG /Name (Screen only) /Usage << /Print << /PrintState /OFF >> /View << /ViewState /ON >> >> >>',
  `<< /Type /XObject /Subtype /Form /BBox [0 0 40 40] /Length ${SQUARE.length} >>\nstream\n${SQUARE}\nendstream`,
  square('10 90 50 130', 36),
  square('60 90 100 130', 0),
  square('110 90 150 130', 4),
  square('150 90 190 130', 6),
  '<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (print) /Rect [10 30 50 70] /F 0 /P 3 0 R /AP << /N 8 0 R >> >>',
  '<< /Type /Annot /Subtype /Widget /FT /Tx /T (stamp) /V (x) /Rect [60 30 100 70] /F 36 /P 3 0 R /AP << /N 8 0 R >> >>',
]);

/** The middle of each square in page space, and where it shows. */
const SPOTS = {
  layerPrintOnly: { at: { x: 30, y: 30 }, display: false, print: true },
  layerScreenOnly: { at: { x: 80, y: 30 }, display: true, print: false },
  annotationPrintOnly: { at: { x: 30, y: 90 }, display: false, print: true },
  annotationScreenOnly: { at: { x: 80, y: 90 }, display: true, print: false },
  annotationBoth: { at: { x: 130, y: 90 }, display: true, print: true },
  annotationHidden: { at: { x: 170, y: 90 }, display: false, print: false },
  fieldScreenOnly: { at: { x: 30, y: 150 }, display: true, print: false },
  fieldPrintOnly: { at: { x: 80, y: 150 }, display: false, print: true },
} as const;

type Spot = keyof typeof SPOTS;
const ANNOTATION_SPOTS: readonly Spot[] = [
  'annotationPrintOnly',
  'annotationScreenOnly',
  'annotationBoth',
  'annotationHidden',
];
const FIELD_SPOTS: readonly Spot[] = ['fieldScreenOnly', 'fieldPrintOnly'];

/**
 * The rights each case opens with: everything, no print, print but not high,
 * print without the screen, and thumbnails only.
 */
export const PRINT_SCOPES = {
  everything: ['*'],
  screen: ['doc.open', 'doc.render', 'doc.annotate.read', 'doc.forms.read'],
  print: ['doc.open', 'doc.render', 'doc.annotate.read', 'doc.forms.read', 'doc.print'],
  printOnly: ['doc.open', 'doc.annotate.read', 'doc.forms.read', 'doc.print'],
  thumbnails: ['doc.open', 'doc.annotate.read', 'doc.forms.read', 'doc.render.thumbnail'],
} as const satisfies Record<string, readonly string[]>;

export interface PrintRenderConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of {@link PRINT_RULES_PDF} with `scope`. */
  open: (engine: Engine, scope: readonly string[]) => Promise<DocumentHandle>;
}

/**
 * Print pictures on both engines (`usage: 'print'` with a `dpi` viewport).
 * A print picture follows
 * the print rules where a screen picture follows the screen's: layers by
 * their print state, annotations and form fields by their `print` flag,
 * `noView` ones included, `hidden` ones never. It is the whole page at its
 * DPI, never more pixels than the page fitted to A4 or Letter needs, and its
 * transform is `pageTransform`'s. It needs `doc.print`, and 300 DPI
 * `doc.print.high`, and not `doc.render`; options that don't fit a print
 * picture are refused. A thumbnail is the whole page at the thumbnail size
 * and needs `doc.render.thumbnail` (which `doc.render` includes), not
 * `doc.render`: each kind of picture needs its own right and no other.
 */
export function runPrintRenderConformance(
  runner: ConformanceTestRunner,
  opts: PrintRenderConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`print render conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;
    let small: PageLayout;
    let large: PageLayout;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine, PRINT_SCOPES.everything);
      const { pages } = await doc.pages.list();
      small = pages[0]!;
      large = pages[1]!;
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    const as = async (
      scope: readonly string[],
      body: (doc: DocumentHandle) => Promise<void>,
    ): Promise<void> => {
      const restricted = await opts.open(engine, scope);
      try {
        await body(restricted);
      } finally {
        await restricted.close();
      }
    };

    /** Which spots are dark in a picture of the small page made with `options`. */
    const darkSpots = (options: PageImageOptions) => darkSpotsOf(doc, small.ref, options);

    test('a print picture is the whole page at its DPI, with pageTransform as its transform', async () => {
      for (const dpi of [150, 300] as const) {
        const options: PageImageOptions = print(dpi);
        const image = await doc.page(small.ref).render.image({ format: 'png', ...options });
        const size = Math.round((200 * dpi) / 72);
        expect([image.width, image.height]).toEqual([size, size]);
        const raster = await decode(image);
        expect([raster.width, raster.height]).toEqual([size, size]);
        const expected = pageTransform(small, options);
        expect([expected.width, expected.height]).toEqual([size, size]);
        expect(
          image.transform.matrix.every((n, i) => Math.abs(n - expected.matrix[i]!) < 1e-9),
        ).toBe(true);
      }
    });

    test('a page bigger than the paper is printed at the size it has fitted to A4 or Letter', async () => {
      const options: PageImageOptions = {
        ...print(150),
        includeAnnotations: false,
        includeFormFields: false,
      };
      const image = await doc.page(large.ref).render.image({ format: 'png', ...options });
      // A0 fitted to 612 × 842 points is A4's long side, 1754 pixels at 150 DPI.
      expect([image.width, image.height]).toEqual([1241, 1754]);
      const expected = pageTransform(large, options);
      expect([expected.width, expected.height]).toEqual([1241, 1754]);
    });

    test('a screen picture follows the screen rules, a print picture the print rules', async () => {
      const layers = { includeAnnotations: true, includeFormFields: true };
      const all = [...ANNOTATION_SPOTS, ...FIELD_SPOTS];
      expect(await darkSpots(layers)).toEqual(shown('display', all));
      expect(await darkSpots({ ...layers, ...print(150) })).toEqual(shown('print', all));
    });

    test('each print picture draws what its family draws', async () => {
      const cases: Array<{ layers: PageImageOptions; spots: readonly Spot[] }> = [
        { layers: { includeAnnotations: false, includeFormFields: false }, spots: [] },
        { layers: { includeAnnotations: true, includeFormFields: false }, spots: ANNOTATION_SPOTS },
        { layers: { includeAnnotations: false, includeFormFields: true }, spots: FIELD_SPOTS },
      ];
      for (const { layers, spots } of cases) {
        expect(await darkSpots({ ...layers, ...print(300) })).toEqual(shown('print', spots));
      }
    });

    test('options that do not fit a print picture are refused', async () => {
      const page = doc.page(small.ref);
      const refused: PageImageOptions[] = [
        { usage: 'print' },
        { usage: 'print', viewport: { kind: 'scale', scale: 2 } },
        { usage: 'print', viewport: { kind: 'width', width: 400 } },
        { usage: 'print', viewport: { kind: 'dpi', dpi: 200 as 150 } },
        { viewport: { kind: 'dpi', dpi: 150 } },
        { usage: 'display', viewport: { kind: 'dpi', dpi: 300 } },
        { ...print(150), target: { kind: 'rect', rect: { x: 0, y: 0, width: 50, height: 50 } } },
        { ...print(150), rotation: 90 },
        { ...print(150), background: 'transparent' },
      ];
      for (const options of refused) {
        await expect(page.render.image({ format: 'png', ...options })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
      }
    });

    test('printing needs doc.print, and 300 DPI doc.print.high', async () => {
      await as(PRINT_SCOPES.screen, async (screenOnly) => {
        const page = screenOnly.page(small.ref);
        const image = await page.render.image({ format: 'png' });
        expect([image.width, image.height]).toEqual([200, 200]);
        await expect(page.render.image({ format: 'png', ...print(150) })).rejects.toMatchObject({
          code: EngineErrorCode.Forbidden,
        });
      });
      await as(PRINT_SCOPES.print, async (printOnly) => {
        const page = printOnly.page(small.ref);
        const image = await page.render.image({ format: 'png', ...print(150) });
        expect((await decode(image)).width).toBe(417);
        await expect(page.render.image({ format: 'png', ...print(300) })).rejects.toMatchObject({
          code: EngineErrorCode.Forbidden,
        });
      });
    });

    test('printing needs no doc.render, and doc.print gives no screen picture', async () => {
      await as(PRINT_SCOPES.printOnly, async (printOnly) => {
        const page = printOnly.page(small.ref);
        const image = await page.render.image({ format: 'png', ...print(150) });
        expect((await decode(image)).width).toBe(417);
        for (const options of [{}, { viewport: { kind: 'thumbnail' } }] as PageImageOptions[]) {
          await expect(page.render.image({ format: 'png', ...options })).rejects.toMatchObject({
            code: EngineErrorCode.Forbidden,
          });
        }
      });
    });

    test('a thumbnail is the whole page, PAGE_THUMBNAIL_SIZE on its long side', async () => {
      const page = doc.page(small.ref);
      const image = await page.render.image({ format: 'png', viewport: { kind: 'thumbnail' } });
      expect([image.width, image.height]).toEqual([PAGE_THUMBNAIL_SIZE, PAGE_THUMBNAIL_SIZE]);
      const pixels = await decode(image);
      expect([pixels.width, pixels.height]).toEqual([PAGE_THUMBNAIL_SIZE, PAGE_THUMBNAIL_SIZE]);
      const tall = await doc
        .page(large.ref)
        .render.image({ format: 'png', viewport: { kind: 'thumbnail' } });
      expect(Math.max(tall.width, tall.height)).toBe(PAGE_THUMBNAIL_SIZE);
      const rect = { kind: 'rect', rect: { x: 0, y: 0, width: 50, height: 50 } } as const;
      for (const options of [
        { viewport: { kind: 'thumbnail' }, target: rect },
        { usage: 'print', viewport: { kind: 'thumbnail' } },
      ] as PageImageOptions[]) {
        await expect(page.render.image({ format: 'png', ...options })).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
      }
    });

    test('a thumbnail needs doc.render.thumbnail, which doc.render includes', async () => {
      await as(PRINT_SCOPES.thumbnails, async (thumbnailsOnly) => {
        const page = thumbnailsOnly.page(small.ref);
        const image = await page.render.image({ format: 'png', viewport: { kind: 'thumbnail' } });
        expect(image.width).toBe(PAGE_THUMBNAIL_SIZE);
        for (const options of [{}, print(150)] as PageImageOptions[]) {
          await expect(page.render.image({ format: 'png', ...options })).rejects.toMatchObject({
            code: EngineErrorCode.Forbidden,
          });
        }
      });
      await as(PRINT_SCOPES.screen, async (screenOnly) => {
        const image = await screenOnly
          .page(small.ref)
          .render.image({ format: 'png', viewport: { kind: 'thumbnail' } });
        expect(image.width).toBe(PAGE_THUMBNAIL_SIZE);
      });
    });
  });
}

/**
 * The print copy on both engines: `pages.extract(pages, { flatten })` makes
 * the pages as they draw for `flatten.usage`, so a print copy, printed, shows
 * what a print picture of the page shows (layers by their print state,
 * annotations and fields by their `print` flag), with nothing interactive
 * left. `includeAnnotations` and `includeFormFields` choose what it paints,
 * with a page picture's defaults; they take `flatten`. A flattened copy needs
 * `doc.download` or `doc.download.flattened`, a plain one `doc.download`.
 */
export interface PrintCopyConformanceOptions extends PrintRenderConformanceOptions {
  /** Open `bytes`, a copy the engine made, with every right. */
  openCopy: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
}

export function runPrintCopyConformance(
  runner: ConformanceTestRunner,
  opts: PrintCopyConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`print copy conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;
    let small: PageLayout;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine, PRINT_SCOPES.everything);
      small = (await doc.pages.list()).pages[0]!;
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    const as = async (
      scope: readonly string[],
      body: (doc: DocumentHandle) => Promise<void>,
    ): Promise<void> => {
      const restricted = await opts.open(engine, scope);
      try {
        await body(restricted);
      } finally {
        await restricted.close();
      }
    };

    /** The spots dark in a picture (made with `picture`) of the copy `options` makes. */
    const copySpots = async (
      source: DocumentHandle,
      options: PageExtractOptions,
      picture: PageImageOptions,
    ): Promise<{ dark: Record<Spot, boolean>; annotations: number }> => {
      const bytes = await source.pages.extract([small.ref], options);
      const copy = await opts.openCopy(engine, bytes);
      try {
        const { pages } = await copy.pages.list();
        expect(pages).toHaveLength(1);
        const page = pages[0]!;
        const { annotations } = await copy.page(page.ref).annotations.list();
        return {
          dark: await darkSpotsOf(copy, page.ref, picture),
          annotations: annotations.length,
        };
      } finally {
        await copy.close();
      }
    };

    test('a print copy, printed, shows what a print picture shows, with nothing interactive left', async () => {
      const before = (await doc.page(small.ref).annotations.list()).annotations.length;
      const all = [...ANNOTATION_SPOTS, ...FIELD_SPOTS];
      const printed = await copySpots(doc, { flatten: { usage: 'print' } }, print(150));
      expect(printed.dark).toEqual(shown('print', all));
      expect(printed.annotations).toBe(0);
      // A read: the source keeps its annotations.
      expect((await doc.page(small.ref).annotations.list()).annotations.length).toBe(before);
    });

    test('a display copy shows what a screen picture shows', async () => {
      const all = [...ANNOTATION_SPOTS, ...FIELD_SPOTS];
      const shownCopy = await copySpots(doc, { flatten: {} }, {});
      expect(shownCopy.dark).toEqual(shown('display', all));
      expect(shownCopy.annotations).toBe(0);
    });

    test('includeAnnotations and includeFormFields choose what a copy paints', async () => {
      const cases: Array<{ options: PageExtractOptions; spots: readonly Spot[] }> = [
        { options: { includeAnnotations: false, includeFormFields: false }, spots: [] },
        {
          options: { includeAnnotations: true, includeFormFields: false },
          spots: ANNOTATION_SPOTS,
        },
        { options: { includeAnnotations: false, includeFormFields: true }, spots: FIELD_SPOTS },
      ];
      for (const { options, spots } of cases) {
        const { dark } = await copySpots(
          doc,
          { ...options, flatten: { usage: 'print' } },
          print(150),
        );
        expect(dark).toEqual(shown('print', spots));
      }
    });

    test('the include options take flatten', async () => {
      for (const options of [{ includeAnnotations: false }, { includeFormFields: true }]) {
        await expect(doc.pages.extract([small.ref], options)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
      }
    });

    test('a flattened copy needs doc.download or doc.download.flattened, and paints what the caller may read', async () => {
      const reads = ['doc.open', 'doc.render', 'doc.annotate.read', 'doc.forms.read'];
      await as([...reads, 'doc.download.flattened'], async (flattenedOnly) => {
        await expect(flattenedOnly.pages.extract([small.ref])).rejects.toMatchObject({
          code: EngineErrorCode.Forbidden,
        });
        const bytes = await flattenedOnly.pages.extract([small.ref], {
          flatten: { usage: 'print' },
        });
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
      });
      await as(reads, async (noDownload) => {
        await expect(
          noDownload.pages.extract([small.ref], { flatten: { usage: 'print' } }),
        ).rejects.toMatchObject({ code: EngineErrorCode.Forbidden });
      });
      // Without doc.annotate.read the annotations stay out, and asking for
      // them is refused.
      await as(
        ['doc.open', 'doc.render', 'doc.forms.read', 'doc.download'],
        async (noAnnotations) => {
          await expect(
            noAnnotations.pages.extract([small.ref], {
              flatten: { usage: 'print' },
              includeAnnotations: true,
            }),
          ).rejects.toMatchObject({ code: EngineErrorCode.Forbidden });
          const { dark } = await copySpots(
            noAnnotations,
            { flatten: { usage: 'print' } },
            print(150),
          );
          expect(dark).toEqual(shown('print', FIELD_SPOTS));
        },
      );
    });
  });
}

/** Which spots are dark in a picture of `ref` made with `options`. */
async function darkSpotsOf(
  doc: DocumentHandle,
  ref: PageRef,
  options: PageImageOptions,
): Promise<Record<Spot, boolean>> {
  const image = await doc.page(ref).render.image({ format: 'png', ...options });
  const raster = await decode(image);
  const dark = {} as Record<Spot, boolean>;
  for (const spot of Object.keys(SPOTS) as Spot[]) {
    const { x, y } = image.transform.pageToPixels(SPOTS[spot].at);
    dark[spot] = isDark(pixel(raster, Math.floor(x), Math.floor(y)));
  }
  return dark;
}

/** The spots `usage` shows when a picture draws the layers and `spots`. */
function shown(usage: 'display' | 'print', spots: readonly Spot[] = []): Record<Spot, boolean> {
  const expected = {} as Record<Spot, boolean>;
  for (const spot of Object.keys(SPOTS) as Spot[]) {
    const layer = spot === 'layerPrintOnly' || spot === 'layerScreenOnly';
    expected[spot] = (layer || spots.includes(spot)) && SPOTS[spot][usage];
  }
  return expected;
}

/** The options of a print picture at `dpi`. */
function print(dpi: PrintDpi): PageImageOptions {
  return { usage: 'print', viewport: { kind: 'dpi', dpi } };
}

/** The image's pixels, read the way an app would on either engine: through `blob()`. */
async function decode(image: PageImageHandle): Promise<Raster> {
  return decodePng(new Uint8Array(await (await image.blob()).arrayBuffer()));
}

function pixel(raster: Raster, x: number, y: number): [number, number, number, number] {
  const at = (y * raster.width + x) * 4;
  const { rgba } = raster;
  return [rgba[at]!, rgba[at + 1]!, rgba[at + 2]!, rgba[at + 3]!];
}

function isDark([r, g, b]: readonly number[]): boolean {
  return r! < 60 && g! < 60 && b! < 60;
}
