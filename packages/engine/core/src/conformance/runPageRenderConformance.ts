import { decodePng, type Raster } from './appearanceRasters';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { PageLayout } from '../dto/PageLayout';
import type { PageImageHandle, PageImageOptions } from '../dto/PageRender';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { pageTransform } from '../geometry/pageTransform';
import { annotationKey } from '../identity/annotationKey';

const SQUARE_CONTENT = '0 g 200 300 100 100 re f';

/**
 * A 600 × 800 page cropped to [100 200 500 600], so its visible area does
 * not start at 0,0, with a black square at 200..300 × 300..400 in file
 * coordinates (the coordinates annotation rects use).
 */
export const CROP_OFFSET_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /CropBox [100 200 500 600] /Contents 4 0 R /Resources << >> >>',
  `<< /Length ${SQUARE_CONTENT.length} >>\nstream\n${SQUARE_CONTENT}\nendstream`,
]);

/** The square in page space: from the crop box's top-left (100, 600), y down. */
const SQUARE_ON_PAGE = { x: 100, y: 200, width: 100, height: 100 };

export interface PageRenderConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of {@link CROP_OFFSET_PDF}. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/**
 * Page images on both engines: an image reports the size of its pixels and
 * where they are on the page (its transform, the one `pageTransform` gives
 * without rendering), a target rect is in page space like every other place
 * (so a page whose crop box doesn't start at 0,0 renders the area asked
 * for), `blob()` is the image's bytes, and quality goes from 0 to 1.
 */
export function runPageRenderConformance(
  runner: ConformanceTestRunner,
  opts: PageRenderConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page render conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;
    let page: PageHandle;
    let layout: PageLayout;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine);
      const { pages } = await doc.pages.list();
      layout = pages[0]!;
      page = doc.page(layout.ref);
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    test('the layout reports where the page sits in PDF space', async () => {
      const { pages } = await doc.pages.list();
      expect(pages[0]!.size).toEqual({ width: 400, height: 400 });
      expect(pages[0]!.pdfCropBox).toEqual({ left: 100, bottom: 200, right: 500, top: 600 });
      expect(pages[0]!.boxes.crop).toEqual({ x: 0, y: 0, width: 400, height: 400 });
    });

    test('an image reports the size of its pixels', async () => {
      const cases: Array<{ options: PageImageOptions; size: [number, number] }> = [
        { options: {}, size: [400, 400] },
        { options: { viewport: { kind: 'scale', scale: 0.25 } }, size: [100, 100] },
        { options: { viewport: { kind: 'width', width: 123 } }, size: [123, 123] },
        {
          options: {
            target: { kind: 'rect', rect: { x: 100, y: 250, width: 100, height: 50 } },
            rotation: 90,
          },
          size: [50, 100],
        },
        {
          options: {
            target: { kind: 'rect', rect: { x: 100, y: 250, width: 100, height: 50 } },
            viewport: { kind: 'width', width: 30 },
          },
          size: [30, 15],
        },
      ];
      for (const { options, size } of cases) {
        const image = await page.render.image({ format: 'png', ...options });
        const raster = await decode(image);
        expect([image.width, image.height]).toEqual(size);
        expect([raster.width, raster.height]).toEqual(size);
      }
    });

    test('a page image starts at the crop box', async () => {
      const raster = await decode(
        await page.render.image({ format: 'png', viewport: { kind: 'scale', scale: 0.5 } }),
      );
      // The square is 100..200 from the crop box's left and 200..300 from its top.
      expect(isDark(pixel(raster, 75, 125))).toBe(true);
      expect(isDark(pixel(raster, 25, 25))).toBe(false);
    });

    test("a target rect is in page space, from the crop box's top-left", async () => {
      const square = await decode(
        await page.render.image({
          format: 'png',
          target: { kind: 'rect', rect: SQUARE_ON_PAGE },
          viewport: { kind: 'scale', scale: 0.1 },
        }),
      );
      expect([square.width, square.height]).toEqual([10, 10]);
      expect(everyPixel(square, isDark)).toBe(true);

      const beside = await decode(
        await page.render.image({
          format: 'png',
          target: { kind: 'rect', rect: { x: 200, y: 200, width: 100, height: 100 } },
          viewport: { kind: 'scale', scale: 0.1 },
        }),
      );
      expect(everyPixel(beside, (rgba) => !isDark(rgba))).toBe(true);
    });

    test('an appearance on a cropped page renders its own area', async () => {
      const { annotation } = await page.annotations.create({
        subtype: 'square',
        box: SQUARE_ON_PAGE,
        color: '#ff0000',
        interiorColor: '#ff0000',
      });
      try {
        const { appearances } = await page.annotations.renderAppearances({ format: 'png' });
        const found = appearances.find(
          (a) => a.mode === 'normal' && annotationKey(a.ref) === annotationKey(annotation.ref),
        );
        expect(found !== undefined).toBe(true);
        // Placed in page space: the square, give or take its border.
        const { x, y, width, height } = found!.rect;
        expect(Math.abs(x - SQUARE_ON_PAGE.x) <= 2 && Math.abs(y - SQUARE_ON_PAGE.y) <= 2).toBe(
          true,
        );
        expect(Math.abs(width - 100) <= 4 && Math.abs(height - 100) <= 4).toBe(true);
        const raster = await decode(found!.image);
        const [r, g, b, a] = pixel(raster, raster.width >> 1, raster.height >> 1);
        expect(r > 200 && g < 60 && b < 60 && a > 200).toBe(true);
      } finally {
        await page.annotations.delete(annotation.ref);
      }
    });

    test("an image's transform is pageTransform's, and puts the page where its pixels are", async () => {
      const cases: PageImageOptions[] = [
        { viewport: { kind: 'scale', scale: 0.5 } },
        { viewport: { kind: 'scale', scale: 0.5 }, rotation: 90 },
        { viewport: { kind: 'width', width: 150 }, rotation: 180 },
        { viewport: { kind: 'width', width: 150 }, rotation: 270 },
        {
          target: { kind: 'rect', rect: { x: 50, y: 150, width: 200, height: 160 } },
          viewport: { kind: 'width', width: 100 },
          rotation: 90,
        },
      ];
      for (const options of cases) {
        const image = await page.render.image({ format: 'png', ...options });
        const { transform } = image;
        expect([transform.width, transform.height]).toEqual([image.width, image.height]);
        const expected = pageTransform(layout, options);
        expect([expected.width, expected.height]).toEqual([image.width, image.height]);
        expect(transform.matrix.every((n, i) => Math.abs(n - expected.matrix[i]!) < 1e-9)).toBe(
          true,
        );

        // The square's middle is dark in the pixels the transform names; a
        // spot away from it is not.
        const raster = await decode(image);
        const inside = transform.pageToPixels({ x: 150, y: 250 });
        expect(isDark(pixel(raster, Math.floor(inside.x), Math.floor(inside.y)))).toBe(true);
        const outside = transform.pageToPixels({ x: 70, y: 250 });
        expect(isDark(pixel(raster, Math.floor(outside.x), Math.floor(outside.y)))).toBe(false);
        const back = transform.pixelsToPage(inside);
        expect(Math.abs(back.x - 150) < 1e-9 && Math.abs(back.y - 250) < 1e-9).toBe(true);
      }
    });

    test('blob() is the image, the same bytes its object URL serves', async () => {
      const image = await page.render.image({
        format: 'png',
        viewport: { kind: 'scale', scale: 0.25 },
      });
      const blob = await image.blob();
      expect(blob.type).toBe(image.contentType);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const decoded = await decodePng(bytes);
      expect([decoded.width, decoded.height]).toEqual([image.width, image.height]);

      const { url, revoke } = await image.objectUrl();
      try {
        const served = new Uint8Array(await (await fetch(url)).arrayBuffer());
        expect(served.length === bytes.length && served.every((b, i) => b === bytes[i])).toBe(true);
      } finally {
        revoke();
      }
    });

    test('quality goes from 0 to 1', async () => {
      for (const quality of [0, 0.5, 1]) {
        const image = await page.render.image({
          format: 'png',
          quality,
          viewport: { kind: 'scale', scale: 0.1 },
        });
        expect([image.width, image.height]).toEqual([40, 40]);
      }
      for (const quality of [-0.1, 1.5, 80]) {
        await expect(
          page.render.image({ format: 'png', quality, viewport: { kind: 'scale', scale: 0.1 } }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      }
    });
  });
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

function everyPixel(raster: Raster, check: (rgba: readonly number[]) => boolean): boolean {
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (!check(pixel(raster, x, y))) return false;
    }
  }
  return true;
}
