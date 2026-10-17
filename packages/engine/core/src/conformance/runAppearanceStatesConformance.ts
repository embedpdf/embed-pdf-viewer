import { decodePng, type Raster } from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationAppearanceImage, AnnotationAppearanceMode } from '../dto/AnnotationRender';
import type { PageImageHandle } from '../dto/PageRender';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { annotationKey } from '../identity/annotationKey';
import { toPageRef } from '../identity/PageRef';

/** A form XObject that fills its 40 × 40 box with one colour. */
const filled = (color: string) => {
  const content = `${color} 0 0 40 40 re f`;
  return `<< /Type /XObject /Subtype /Form /BBox [0 0 40 40] /Length ${content.length} >>\nstream\n${content}\nendstream`;
};

/**
 * One 200 × 200 page with a check box that is off and stores every mode:
 * normal Yes red and Off green, down Yes blue and Off yellow, rollover Yes
 * black. Beside it, a square whose normal appearance is one stream (cyan).
 * Each appearance fills its box, so a picture's middle names its state.
 */
export const APPEARANCE_STATES_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] >> >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [4 0 R 10 0 R] >>',
  '<< /Type /Annot /Subtype /Widget /FT /Btn /T (states) /V /Off /AS /Off /F 4 /Rect [20 20 60 60] ' +
    '/AP << /N << /Yes 5 0 R /Off 6 0 R >> /D << /Yes 7 0 R /Off 8 0 R >> /R << /Yes 9 0 R >> >> >>',
  filled('1 0 0 rg'),
  filled('0 1 0 rg'),
  filled('0 0 1 rg'),
  filled('1 1 0 rg'),
  filled('0 g'),
  '<< /Type /Annot /Subtype /Square /Rect [100 20 140 60] /F 4 /AP << /N 11 0 R >> >>',
  filled('0 1 1 rg'),
]);

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];
const BLACK = [0, 0, 0];
const CYAN = [0, 255, 255];
const WHITE = [255, 255, 255];

export interface AppearanceStatesConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link APPEARANCE_STATES_FIXTURE_PDF}, fresh for each call. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/**
 * Appearance states and modes, and form fields in page renders, the same on
 * every engine. A page's appearance batch holds every appearance an
 * annotation stores: each mode it has, and every state of each mode, each
 * image labelled with both, whatever `/AS` says. The annotation's
 * `appearanceState` says which state it shows. Each family has its own
 * batch: `page.annotations` the square's, `page.forms` the check box's, and
 * neither holds the other's. A page picture draws what its two options ask
 * for, the annotations and the form fields, each without the other.
 */
export function runAppearanceStatesConformance(
  runner: ConformanceTestRunner,
  opts: AppearanceStatesConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`appearance states conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;
    let page: PageHandle;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine);
      const { pages } = await doc.pages.list();
      page = doc.page(toPageRef(pages[0]!.ref.objectNumber));
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    const annotations = async () => {
      const { annotations: listed } = await page.annotations.list();
      const { widgets } = await doc.forms.list();
      const box = widgets.find((widget) => widget.page.objectNumber === page.ref.objectNumber);
      const square = listed.find((annotation) => annotation.subtype === 'square');
      if (!box || !square) throw new Error('the fixture has a check box and a square');
      expect(listed.some((annotation) => annotation.subtype === 'widget')).toBe(false);
      return { box, square };
    };

    /** `mode:state` of each picture of each annotation, by annotation key. */
    const labelsOf = (appearances: readonly AnnotationAppearanceImage[]) => {
      const labels = new Map<string, string[]>();
      for (const { ref, mode, state } of appearances) {
        const key = annotationKey(ref);
        labels.set(key, [...(labels.get(key) ?? []), `${mode}:${state ?? '-'}`].sort());
      }
      return labels;
    };

    /** Both families' pictures, each from its own batch. */
    const render = async (modes?: AnnotationAppearanceMode[]) => {
      const options = {
        format: 'png' as const,
        viewport: { kind: 'scale' as const, scale: 1 },
        ...(modes ? { modes } : {}),
      };
      const [annotationImages, widgetImages] = await Promise.all([
        page.annotations.renderAppearances(options),
        page.forms.renderAppearances(options),
      ]);
      return { appearances: [...annotationImages.appearances, ...widgetImages.appearances] };
    };

    test("each family's batch holds only its own pictures", async () => {
      const { box, square } = await annotations();
      const options = { format: 'png' as const, viewport: { kind: 'scale' as const, scale: 1 } };
      const keys = async (batch: Promise<{ appearances: readonly AnnotationAppearanceImage[] }>) =>
        new Set((await batch).appearances.map((appearance) => annotationKey(appearance.ref)));
      expect(await keys(page.annotations.renderAppearances(options))).toEqual(
        new Set([annotationKey(square.ref)]),
      );
      expect(await keys(page.forms.renderAppearances(options))).toEqual(
        new Set([annotationKey(box.ref)]),
      );
    });

    test('every mode and state an annotation stores comes back, labelled', async () => {
      const { box, square } = await annotations();
      const labels = labelsOf((await render()).appearances);
      expect(labels.get(annotationKey(box.ref))).toEqual([
        'down:Off',
        'down:Yes',
        'normal:Off',
        'normal:Yes',
        'rollover:Yes',
      ]);
      expect(labels.get(annotationKey(square.ref))).toEqual(['normal:-']);
    });

    test('each picture draws its own state, whatever the check box shows', async () => {
      const { box } = await annotations();
      const expected: Record<string, number[]> = {
        'normal:Yes': RED,
        'normal:Off': GREEN,
        'down:Yes': BLUE,
        'down:Off': YELLOW,
        'rollover:Yes': BLACK,
      };
      const pictures = (await render()).appearances.filter(
        (appearance) => annotationKey(appearance.ref) === annotationKey(box.ref),
      );
      for (const picture of pictures) {
        const raster = await decode(picture.image);
        const middle = pixel(raster, raster.width >> 1, raster.height >> 1).slice(0, 3);
        expect([`${picture.mode}:${picture.state}`, middle]).toEqual([
          `${picture.mode}:${picture.state}`,
          expected[`${picture.mode}:${picture.state}`],
        ]);
      }
    });

    test('appearanceState names the state an annotation shows', async () => {
      const { box, square } = await annotations();
      expect(box.appearanceState).toBe('Off');
      expect(square.appearanceState).toBeNull();
    });

    test('modes asks for some modes only; every mode is the same as none', async () => {
      const { box, square } = await annotations();
      const normal = labelsOf((await render(['normal'])).appearances);
      expect(normal.get(annotationKey(box.ref))).toEqual(['normal:Off', 'normal:Yes']);
      expect(normal.get(annotationKey(square.ref))).toEqual(['normal:-']);
      const every = labelsOf((await render(['down', 'normal', 'rollover'])).appearances);
      expect(every).toEqual(labelsOf((await render()).appearances));
    });

    test('an empty modes list is refused', async () => {
      const options = { format: 'png' as const, modes: [] };
      await expect(page.annotations.renderAppearances(options)).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
      });
      await expect(page.forms.renderAppearances(options)).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
      });
    });

    test('a page picture draws its annotations and its form fields, each without the other', async () => {
      const middleOf = async (options: {
        includeAnnotations?: boolean;
        includeFormFields?: boolean;
      }) => {
        const raster = await decode(
          await page.render.image({
            format: 'png',
            viewport: { kind: 'scale', scale: 1 },
            ...options,
          }),
        );
        // The check box spans 20..60 and the square 100..140, both 140..180 from the top.
        return {
          box: pixel(raster, 40, 160).slice(0, 3),
          square: pixel(raster, 120, 160).slice(0, 3),
        };
      };
      // Left out: everything the caller may read (here, everything).
      expect(await middleOf({})).toEqual({ box: GREEN, square: CYAN });
      expect(await middleOf({ includeAnnotations: true, includeFormFields: true })).toEqual({
        box: GREEN,
        square: CYAN,
      });
      expect(await middleOf({ includeFormFields: false })).toEqual({ box: WHITE, square: CYAN });
      expect(await middleOf({ includeAnnotations: false, includeFormFields: true })).toEqual({
        box: GREEN,
        square: WHITE,
      });
      // Annotations off turns the fields off too, unless they're asked for.
      expect(await middleOf({ includeAnnotations: false })).toEqual({ box: WHITE, square: WHITE });
    });
  });
}

/** The image's pixels, read the way an app would on either engine: through `blob()`. */
async function decode(image: PageImageHandle): Promise<Raster> {
  return decodePng(new Uint8Array(await (await image.blob()).arrayBuffer()));
}

function pixel(raster: Raster, x: number, y: number): number[] {
  const at = (y * raster.width + x) * 4;
  return [...raster.rgba.subarray(at, at + 4)];
}
