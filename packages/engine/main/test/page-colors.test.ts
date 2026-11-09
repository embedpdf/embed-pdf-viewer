/**
 * `pageColors` on the local engine, with the real runtime: the picture a page
 * gets in other colors, its tiles, its turns, and what the colors reach. A
 * 200 x 200 point page with a grey box and a label on it, a red bar, a blue
 * frame and a magenta and green picture, so each kind of page content shows
 * which of the colors it takes, and the picture shows what is left as authored.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { APPEARANCE_STATES_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import type {
  LocalEngine,
  LocalPageHandle,
  PageRenderOptions,
} from '@embedpdf/engine-core/runtime';

import { createLocalEngine } from '../src/index';
import { pdf } from './helpers/miniPdf';

interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

const content = [
  '0.9 0.9 0.9 rg 20 120 160 60 re f',
  '0 0 0 rg BT /F1 14 Tf 30 145 Td (Label on a box) Tj ET',
  '0.8 0.1 0.1 rg 20 80 100 20 re f',
  '0 0 1 RG 2 w 20 20 m 180 20 l 180 60 l 20 60 l h S',
  'q 40 0 0 40 130 100 cm /Im1 Do Q',
].join('\n');
// A 2 x 2 picture: magenta and green, green and magenta.
const picture = 'FF00FF00A00000A000FF00FF>';

function figurePdf(pageExtra = ''): Uint8Array {
  return pdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] ${pageExtra} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>`,
    4: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    6: `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${picture.length} >>\nstream\n${picture}\nendstream`,
  });
}

const MAGENTA = [255, 0, 255];
const GREEN = [0, 160, 0];

/** At scale 2, the page's regions in pixels, from its top-left corner. */
const AT = {
  paper: [4, 396],
  boxInside: [330, 50],
  barInside: [140, 220],
  barLeftEdge: [40, 220],
  frameLeft: [40, 320],
  label: { x: 60, y: 85, width: 110, height: 40 },
  magentaCell: [270, 130],
  greenCell: [330, 130],
} as const;

const pixel = (raster: Raster, [x, y]: readonly [number, number] | readonly number[]) => {
  const at = (y! * raster.width + x!) * 4;
  return [...raster.data.subarray(at, at + 4)];
};

/** Whether the pixels of the region have one at most `tolerance` from `color`, per channel. */
function hasColor(
  raster: Raster,
  region: { x: number; y: number; width: number; height: number },
  color: readonly number[],
  tolerance = 2,
): boolean {
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const found = pixel(raster, [x, y]);
      if (color.every((channel, at) => Math.abs(found[at]! - channel) <= tolerance)) return true;
    }
  }
  return false;
}

/** The box around the pixels of exactly `color`. */
function boundsOf(raster: Raster, color: readonly number[]) {
  let [left, top, right, bottom] = [raster.width, raster.height, -1, -1];
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const found = pixel(raster, [x, y]);
      if (!color.every((channel, at) => found[at] === channel)) continue;
      [left, top, right, bottom] = [
        Math.min(left, x),
        Math.min(top, y),
        Math.max(right, x),
        Math.max(bottom, y),
      ];
    }
  }
  return { left, top, right, bottom };
}

/** Both renders hold the same pixels in the box. */
function sameInBox(
  left: Raster,
  right: Raster,
  box: { left: number; top: number; right: number; bottom: number },
): boolean {
  for (let y = box.top; y <= box.bottom; y++) {
    for (let x = box.left; x <= box.right; x++) {
      if (pixel(left, [x, y]).join() !== pixel(right, [x, y]).join()) return false;
    }
  }
  return true;
}

/** The pixels of `raster` inside `box`. */
function cropped(raster: Raster, box: { x: number; y: number; width: number; height: number }) {
  const data = new Uint8Array(box.width * box.height * 4);
  for (let row = 0; row < box.height; row++) {
    const from = ((box.y + row) * raster.width + box.x) * 4;
    data.set(raster.data.subarray(from, from + box.width * 4), row * box.width * 4);
  }
  return { width: box.width, height: box.height, data };
}

async function rasterOf(page: LocalPageHandle, options: PageRenderOptions): Promise<Raster> {
  const raster = await page.render.raw(options);
  return { width: raster.width, height: raster.height, data: new Uint8Array(raster.data) };
}

describe.each(['wasm', 'native'] as const)('pageColors on the %s runtime', (prefer) => {
  let engine: LocalEngine;
  let opened = 0;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function openPage(bytes: Uint8Array, scope: readonly string[] = ['*']) {
    const doc = await engine.open(
      { kind: 'bytes', id: `page-colors-${prefer}-${opened++}`, bytes: bytes.slice() },
      { scope: [...scope] },
    );
    const { pages } = await doc.pages.list();
    return { doc, page: doc.page(pages[0]!.ref), pages };
  }

  const scale2 = { viewport: { kind: 'scale', scale: 2 } } as const;

  test("'normal' and no pageColors are the same picture", async () => {
    const { doc, page } = await openPage(figurePdf());
    const none = await rasterOf(page, scale2);
    const normal = await rasterOf(page, { ...scale2, pageColors: 'normal' });
    expect(normal.data).toEqual(none.data);
    expect(pixel(none, AT.paper)).toEqual([255, 255, 255, 255]);
    await doc.close();
  });

  test('dark draws light ink on dark paper, and the picture as the file has it', async () => {
    const { doc, page } = await openPage(figurePdf());
    const dark = await rasterOf(page, { ...scale2, pageColors: 'dark' });
    expect(pixel(dark, AT.paper)).toEqual([30, 30, 30, 255]);
    // Text is light, and shapes are outlines: a label on a box stays readable.
    expect(hasColor(dark, AT.label, [232, 230, 227])).toBe(true);
    expect(pixel(dark, AT.boxInside)).toEqual([30, 30, 30, 255]);
    expect(pixel(dark, AT.barInside)).toEqual([30, 30, 30, 255]);
    expect(
      hasColor(dark, { x: 38, y: 218, width: 5, height: 5 }, [232, 230, 227], 30),
      'the bar is drawn as an outline',
    ).toBe(true);
    expect(pixel(dark, AT.magentaCell).slice(0, 3)).toEqual(MAGENTA);
    expect(pixel(dark, AT.greenCell).slice(0, 3)).toEqual(GREEN);
    await doc.close();
  });

  test('sepia draws brown ink on cream paper', async () => {
    const { doc, page } = await openPage(figurePdf());
    const sepia = await rasterOf(page, { ...scale2, pageColors: 'sepia' });
    expect(pixel(sepia, AT.paper)).toEqual([244, 236, 216, 255]);
    expect(hasColor(sepia, AT.label, [91, 70, 54])).toBe(true);
    await doc.close();
  });

  test('your own colors reach the paper, shapes, lines and text, each its own', async () => {
    const { doc, page } = await openPage(figurePdf());
    const custom = await rasterOf(page, {
      ...scale2,
      pageColors: {
        background: '#102030',
        pathFill: '#00ff00',
        pathStroke: '#ffff00',
        textFill: '#ff0000',
      },
    });
    // Red, green and blue are not swapped on their way to the bitmap.
    expect(pixel(custom, AT.paper)).toEqual([16, 32, 48, 255]);
    expect(pixel(custom, AT.boxInside)).toEqual([0, 255, 0, 255]);
    expect(pixel(custom, AT.frameLeft)).toEqual([255, 255, 0, 255]);
    expect(hasColor(custom, AT.label, [255, 0, 0])).toBe(true);
    expect(pixel(custom, AT.magentaCell).slice(0, 3)).toEqual(MAGENTA);
    await doc.close();
  });

  test('text takes the one color a custom scheme names, and black when it names none', async () => {
    const { doc, page } = await openPage(figurePdf());
    const text = await rasterOf(page, { ...scale2, pageColors: { text: '#ff00ff' } });
    expect(pixel(text, AT.paper)).toEqual([255, 255, 255, 255]);
    expect(pixel(text, AT.boxInside)).toEqual([255, 0, 255, 255]);
    const empty = await rasterOf(page, { ...scale2, pageColors: {} });
    expect(pixel(empty, AT.boxInside)).toEqual([0, 0, 0, 255]);
    await doc.close();
  });

  test('a transparent background stays transparent, and the ink is recolored', async () => {
    const { doc, page } = await openPage(figurePdf());
    const dark = await rasterOf(page, {
      ...scale2,
      pageColors: 'dark',
      background: 'transparent',
    });
    expect(pixel(dark, AT.paper)[3]).toBe(0);
    expect(hasColor(dark, AT.label, [232, 230, 227], 30)).toBe(true);
    await doc.close();
  });

  test('a thumbnail takes the colors too', async () => {
    const { doc, page } = await openPage(figurePdf());
    const thumbnail = await rasterOf(page, {
      viewport: { kind: 'thumbnail' },
      pageColors: 'dark',
    });
    expect(pixel(thumbnail, [2, 2])).toEqual([30, 30, 30, 255]);
    await doc.close();
  });

  test('a tile is the part of the page it shows', async () => {
    const { doc, page } = await openPage(figurePdf());
    for (const pageColors of ['dark', { background: '#102030', text: '#00ff00' }] as const) {
      const whole = await rasterOf(page, { ...scale2, pageColors });
      // The box, the label, the picture's left edge and some paper, on whole pixels at scale 2.
      const rect = { x: 20, y: 20, width: 130, height: 80 };
      const tile = await rasterOf(page, {
        ...scale2,
        pageColors,
        target: { kind: 'rect', rect },
      });
      expect(tile).toEqual(cropped(whole, { x: 40, y: 40, width: 260, height: 160 }));
    }
    await doc.close();
  });

  test('a page and a tile at a fractional scale put the picture within a pixel of the render as authored', async () => {
    const { doc, page } = await openPage(figurePdf());
    const viewport = { kind: 'scale', scale: 1.337 } as const;
    // The colors' render places the page on whole pixels, which the render as authored does not.
    const rect = { x: 100, y: 30, width: 80, height: 90 };
    for (const target of [undefined, { kind: 'rect', rect } as const]) {
      const options = { viewport, ...(target ? { target } : {}) };
      const authored = await rasterOf(page, options);
      const dark = await rasterOf(page, { ...options, pageColors: 'dark' });
      expect([dark.width, dark.height]).toEqual([authored.width, authored.height]);
      const [was, is] = [boundsOf(authored, MAGENTA), boundsOf(dark, MAGENTA)];
      for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
        expect(Math.abs(is[edge] - was[edge]), edge).toBeLessThanOrEqual(1);
      }
    }
    await doc.close();
  });

  test('a turned picture keeps its picture where the render puts it, whichever way', async () => {
    const { doc, page } = await openPage(figurePdf());
    for (const rotation of [90, 180, 270] as const) {
      const authored = await rasterOf(page, { ...scale2, rotation });
      const dark = await rasterOf(page, { ...scale2, rotation, pageColors: 'dark' });
      expect(dark.width).toBe(authored.width);
      const bounds = boundsOf(authored, MAGENTA);
      const inside = {
        left: bounds.left + 2,
        top: bounds.top + 2,
        right: bounds.right - 2,
        bottom: bounds.bottom - 2,
      };
      expect(sameInBox(dark, authored, inside), `${rotation}`).toBe(true);
      expect(pixel(dark, [2, 2]), `${rotation}`).toEqual([30, 30, 30, 255]);
    }
    await doc.close();
  });

  test('a page with /Rotate is drawn as the render turns it, and in color', async () => {
    const { doc, page, pages } = await openPage(figurePdf('/Rotate 90'));
    const rotation = pages[0]!.rotation;
    const authored = await rasterOf(page, { ...scale2, rotation });
    const dark = await rasterOf(page, { ...scale2, rotation, pageColors: 'dark' });
    const bounds = boundsOf(authored, MAGENTA);
    expect(
      sameInBox(dark, authored, {
        left: bounds.left + 2,
        top: bounds.top + 2,
        right: bounds.right - 2,
        bottom: bounds.bottom - 2,
      }),
    ).toBe(true);
    expect(pixel(dark, [2, 2])).toEqual([30, 30, 30, 255]);
    await doc.close();
  });

  test('annotations and form fields are drawn in the colors, each only when asked', async () => {
    const { doc, page } = await openPage(APPEARANCE_STATES_FIXTURE_PDF);
    const pageColors = { background: '#000000', text: '#ffffff' } as const;
    const viewport = { kind: 'scale', scale: 1 } as const;
    // The check box spans 20..60 and the square 100..140, both 140..180 from the top.
    const box = [40, 160] as const;
    const square = [120, 160] as const;
    const both = await rasterOf(page, { viewport, pageColors });
    expect([pixel(both, box), pixel(both, square)]).toEqual([
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    const none = await rasterOf(page, {
      viewport,
      pageColors,
      includeAnnotations: false,
      includeFormFields: false,
    });
    expect([pixel(none, box), pixel(none, square)]).toEqual([
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);
    const fields = await rasterOf(page, {
      viewport,
      pageColors,
      includeAnnotations: false,
      includeFormFields: true,
    });
    expect([pixel(fields, box), pixel(fields, square)]).toEqual([
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    await doc.close();
  });

  test('an image is encoded from the picture in the colors', async () => {
    const { doc, page } = await openPage(figurePdf());
    const image = await page.render.image({ ...scale2, pageColors: 'dark', format: 'bmp' });
    const bytes = new Uint8Array(await (await image.blob()).arrayBuffer());
    expect(image.format).toBe('bmp');
    // A BMP's rows run bottom-up with blue first: its first row is the page's last, on dark paper.
    const pixelsAt = bytes[10]! | (bytes[11]! << 8) | (bytes[12]! << 16);
    expect([...bytes.subarray(pixelsAt, pixelsAt + 3)]).toEqual([30, 30, 30]);
    await doc.close();
  });

  test('a color that is not a color, and a print picture with colors, are refused, naming the option', async () => {
    const { doc, page } = await openPage(figurePdf());
    const refused = async (options: PageRenderOptions) =>
      page.render.raw(options).then(
        () => null,
        (error: { code: string; details?: { field?: string } }) => ({
          code: error.code,
          field: error.details?.field,
        }),
      );
    const invalid = (field: string) => ({ code: 'InvalidArg', field });
    expect(await refused({ pageColors: 'night' as never })).toEqual(invalid('pageColors'));
    expect(await refused({ pageColors: { text: 'red' } })).toEqual(invalid('pageColors.text'));
    expect(await refused({ pageColors: { background: '#fff' } })).toEqual(
      invalid('pageColors.background'),
    );
    expect(await refused({ pageColors: { colour: '#000000' } as never })).toEqual(
      invalid('pageColors.colour'),
    );
    expect(await refused({ pageColors: { convertFillToStroke: 1 } as never })).toEqual(
      invalid('pageColors.convertFillToStroke'),
    );
    expect(
      await refused({
        usage: 'print',
        viewport: { kind: 'dpi', dpi: 150 },
        pageColors: 'dark',
      }),
    ).toEqual(invalid('pageColors'));
    await doc.close();
  });
});
