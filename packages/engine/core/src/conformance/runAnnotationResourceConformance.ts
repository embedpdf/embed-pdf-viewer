import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationDraft, AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PdfRect } from '../geometry/primitives';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { toPageRef, type PageRef } from '../identity/PageRef';

/**
 * The documents the suite opens, each a fresh copy:
 *
 * - `authoring`: any document; stamps are created on its first page.
 * - `acrobat-stamps`: `stamp-opacity-acrobat.pdf`
 *   (`packages/engine/main/test/fixtures`): two stamps Acrobat saved at about
 *   30% opacity, each appearance `/R0 gs /MWFOForm Do` with /R0 repeating the
 *   stamp's /CA.
 * - `acrobat-rewrapped`: `stamp-rewrapped-acrobat.pdf`, stamps as EmbedPDF
 *   writes them after other tools edited them: `rewrapped-a`, turned 30
 *   degrees and set to 60% in Acrobat, under Acrobat's layer and four forms
 *   that only draw our wrapper; `rewrapped-b`, set to 100% in Acrobat, under
 *   one such form; `rewrapped-c`, our 35% layer with /CA dropped, 300 x 120.
 *   Each draws a 200 x 100 drawing, opaque where it paints.
 * - `acrobat-roundtrip-60`, `acrobat-roundtrip-100`:
 *   `stamp-roundtrip-acrobat-{60,100}.pdf`, an "Approved" stamp made in the
 *   viewer, turned and set to 40%, then set to 60% and to 100% in Acrobat
 *   26.2. Acrobat moves the form around our wrapper by 0.0008 pt, its box a
 *   fraction off the origin in its own arithmetic.
 */
export type AnnotationResourceFixture =
  | 'authoring'
  | 'acrobat-stamps'
  | 'acrobat-rewrapped'
  | 'acrobat-roundtrip-60'
  | 'acrobat-roundtrip-100';

export interface AnnotationResourceConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of a fixture, with `doc.download` among its scopes. */
  open: (engine: Engine, fixture: AnnotationResourceFixture) => Promise<DocumentHandle>;
  /** Whether the engine renders raw appearance rasters (local) or only encoded images (cloud). */
  rawAppearances: boolean;
}

/**
 * Resources beside an annotation's data, on both engines: `readResource`
 * returns what `create(data, resources)` needs to make the same annotation
 * again. A stamp's appearance is its drawing without the fit, rotation and
 * opacity its data describes; a stamp another tool made is drawn as shown,
 * without a layer that only repeats its /CA. The opacity is painted once:
 * in a copy, after a resize, and after a change.
 */
export function runAnnotationResourceConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationResourceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation resource conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const onPage = async (
      fixture: AnnotationResourceFixture,
      run: (page: PageHandle) => Promise<void>,
    ): Promise<void> => {
      const doc = await opts.open(engine, fixture);
      try {
        await run(doc.page(await firstPage(doc)));
      } finally {
        await doc.close();
      }
    };

    const rasterOf = (page: PageHandle, ref: AnnotationRef) =>
      appearanceRaster(page, ref, opts.rawAppearances);

    const expectSameDrawing = (actual: Raster, expected: Raster) => {
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
      expect(maxDifference(actual, expected) <= 3).toBe(true);
    };

    test("a stamp's appearance and its data make the same stamp", async () => {
      await onPage('authoring', async (page) => {
        const rect: PdfRect = { left: 100, bottom: 100, right: 260, top: 180 };
        const { created } = await page.annotations.create(
          {
            subtype: 'stamp',
            rect: { left: 80, bottom: 60, right: 280, top: 220 },
            unrotatedRect: rect,
            rotation: 30,
            fit: 'cover',
            opacity: 0.5,
            name: 'Approved',
          },
          { appearance: BANDS_PDF },
        );
        const appearance = await page.annotations.readResource(created.ref, 'appearance');
        expect([...appearance.subarray(0, 4)]).toEqual(PDF_MAGIC);

        const data = JSON.parse(JSON.stringify(created)) as AnnotationDraft;
        const copy = (await page.annotations.create(data, { appearance })).created;
        expect(dataOf(copy)).toEqual(dataOf(created));
        expectSameDrawing(await rasterOf(page, copy.ref), await rasterOf(page, created.ref));
      });
    });

    const acrobatStamps = async (page: PageHandle) => {
      const { annotations } = await page.annotations.list();
      const stamps = annotations.filter((annotation) => annotation.subtype === 'stamp');
      expect(stamps.length).toBe(2);
      return stamps;
    };

    /** Painted once: both artworks have opaque pixels, so the most opaque is the opacity. */
    const expectPaintedOnce = (raster: Raster, opacity: number) => {
      expect(Math.abs(maxAlpha(raster) - opacity * 255) <= 3).toBe(true);
    };

    test('a copy of a stamp another tool made is drawn as the page shows it', async () => {
      await onPage('acrobat-stamps', async (page) => {
        for (const stamp of await acrobatStamps(page)) {
          // Acrobat's 30%, in the 1/255 steps opacity is stored in.
          expect(stamp.opacity! > 0.25 && stamp.opacity! < 0.35).toBe(true);
          const appearance = await page.annotations.readResource(stamp.ref, 'appearance');
          const data = JSON.parse(JSON.stringify(stamp)) as AnnotationDraft;
          const copy = (await page.annotations.create(data, { appearance })).created;
          // The popup is another annotation; a copy is made without one.
          expect(dataOf(copy)).toEqual({ ...dataOf(stamp), popup: null });
          const drawn = await rasterOf(page, copy.ref);
          expectPaintedOnce(drawn, stamp.opacity!);
          expectSameDrawing(drawn, await rasterOf(page, stamp.ref));
        }
      });
    });

    test('a stamp another tool made keeps its opacity through a resize', async () => {
      await onPage('acrobat-stamps', async (page) => {
        for (const stamp of await acrobatStamps(page)) {
          const { left, bottom, right, top } = stamp.rect;
          const { updated } = await page.annotations.update(stamp.ref, {
            rect: {
              left,
              bottom,
              right: left + (right - left) * 2,
              top: bottom + (top - bottom) * 2,
            },
          });
          expectPaintedOnce(await rasterOf(page, updated.ref), stamp.opacity!);
        }
      });
    });

    test('a new opacity on a stamp another tool made replaces its own', async () => {
      await onPage('acrobat-stamps', async (page) => {
        for (const stamp of await acrobatStamps(page)) {
          for (const opacity of [1, 0.5]) {
            const { updated } = await page.annotations.update(stamp.ref, { opacity });
            expect(updated.subtype === 'stamp' && updated.opacity).toBe(
              opacity === 1 ? 1 : 128 / 255,
            );
            expectPaintedOnce(await rasterOf(page, updated.ref), opacity);
          }
        }
      });
    });

    test('a turned stamp renders unturned as its unturned twin', async () => {
      await onPage('authoring', async (page) => {
        const unrotatedRect: PdfRect = { left: 100, bottom: 100, right: 260, top: 180 };
        const common = { subtype: 'stamp', fit: 'cover', opacity: 0.5 } as const;
        const turned = (
          await page.annotations.create(
            {
              ...common,
              rect: { left: 80, bottom: 60, right: 280, top: 220 },
              unrotatedRect,
              rotation: 30,
            },
            { appearance: BANDS_PDF },
          )
        ).created;
        const flat = (
          await page.annotations.create(
            { ...common, rect: unrotatedRect },
            { appearance: BANDS_PDF },
          )
        ).created;
        expectSameDrawing(await rasterOf(page, turned.ref), await rasterOf(page, flat.ref));
      });
    });

    /** The fixture's stamps by name: `a`, `b`, `c` for `rewrapped-a` and so on. */
    const rewrappedStamp = async (page: PageHandle, name: 'a' | 'b' | 'c') => {
      const { annotations } = await page.annotations.list();
      const stamp = annotations.find(
        (annotation): annotation is Extract<AnnotationDTO, { subtype: 'stamp' }> =>
          annotation.subtype === 'stamp' && annotation.nm === `rewrapped-${name}`,
      );
      if (!stamp) throw new Error(`no stamp rewrapped-${name}`);
      return stamp;
    };

    test('a stamp we made is ours again after Acrobat wrapped it', async () => {
      await onPage('acrobat-rewrapped', async (page) => {
        const turned = await rewrappedStamp(page, 'a');
        const opaque = await rewrappedStamp(page, 'b');
        expect(turned).toMatchObject({ rotation: 30, fit: 'contain' });
        expect(Math.abs(turned.opacity! - 0.6) < 0.005).toBe(true);
        expect(opaque.opacity).toBe(1);
        for (const stamp of [turned, opaque]) {
          expectPaintedOnce(await rasterOf(page, stamp.ref), stamp.opacity!);
          // Our drawing in its own box, not the appearance Acrobat put around it.
          const drawing = await page.annotations.readResource(stamp.ref, 'appearance');
          expect(pageSize(drawing)).toEqual([200, 100]);
        }
      });
    });

    test('a resize of a turned stamp Acrobat wrapped turns it once', async () => {
      await onPage('acrobat-rewrapped', async (page) => {
        const turned = await rewrappedStamp(page, 'a');
        const drawing = await page.annotations.readResource(turned.ref, 'appearance');
        const box = turned.unrotatedRect!;
        const { updated } = await page.annotations.update(turned.ref, {
          unrotatedRect: { ...box, right: box.right + 60 },
          rotation: 30,
        });
        expect(pageSize(await page.annotations.readResource(updated.ref, 'appearance'))).toEqual([
          200, 100,
        ]);
        // The same data and drawing made afresh: one turn, one fit, one opacity.
        const data = JSON.parse(JSON.stringify(updated)) as AnnotationDraft;
        const twin = (await page.annotations.create(data, { appearance: drawing })).created;
        expectSameDrawing(await rasterOf(page, updated.ref), await rasterOf(page, twin.ref));
        expectPaintedOnce(await rasterOf(page, updated.ref), turned.opacity!);
      });
    });

    test('a new opacity on a stamp Acrobat wrapped replaces the old one', async () => {
      await onPage('acrobat-rewrapped', async (page) => {
        for (const name of ['a', 'b'] as const) {
          const stamp = await rewrappedStamp(page, name);
          for (const opacity of [1, 0.5, 0.3]) {
            const { updated } = await page.annotations.update(stamp.ref, { opacity });
            expectPaintedOnce(await rasterOf(page, updated.ref), opacity);
          }
        }
      });
    });

    for (const fixture of ['acrobat-roundtrip-60', 'acrobat-roundtrip-100'] as const) {
      test(`a turned stamp from here, edited in Acrobat, turns once (${fixture})`, async () => {
        await onPage(fixture, async (page) => {
          const { annotations } = await page.annotations.list();
          const stamp = annotations.find(
            (annotation): annotation is Extract<AnnotationDTO, { subtype: 'stamp' }> =>
              annotation.subtype === 'stamp',
          )!;
          expect(stamp.rotation !== null && stamp.unrotatedRect !== null).toBe(true);
          expect(
            Math.abs(stamp.opacity - (fixture === 'acrobat-roundtrip-60' ? 0.6 : 1)) < 0.01,
          ).toBe(true);
          // Unturned as its twin made afresh from its data and drawing.
          const drawing = await page.annotations.readResource(stamp.ref, 'appearance');
          const twin = (
            await page.annotations.create(JSON.parse(JSON.stringify(stamp)) as AnnotationDraft, {
              appearance: drawing,
            })
          ).created;
          expectSameDrawing(await rasterOf(page, stamp.ref), await rasterOf(page, twin.ref));

          // And after a resize here.
          const box = stamp.unrotatedRect!;
          const { updated } = await page.annotations.update(stamp.ref, {
            unrotatedRect: { ...box, right: box.right + 40 },
            rotation: stamp.rotation,
          });
          const resized = (
            await page.annotations.create(JSON.parse(JSON.stringify(updated)) as AnnotationDraft, {
              appearance: drawing,
            })
          ).created;
          expectSameDrawing(await rasterOf(page, updated.ref), await rasterOf(page, resized.ref));
        });
      });
    }

    test('an opacity the data does not describe is part of the drawing', async () => {
      await onPage('acrobat-rewrapped', async (page) => {
        const stamp = await rewrappedStamp(page, 'c');
        expect(stamp.opacity).toBe(1);
        const shown = await rasterOf(page, stamp.ref);
        expectPaintedOnce(shown, 0.35);
        // Drawn as the page shows it, in /Rect, the 35% included.
        const appearance = await page.annotations.readResource(stamp.ref, 'appearance');
        expect(pageSize(appearance)).toEqual([300, 120]);
        const data = JSON.parse(JSON.stringify(stamp)) as AnnotationDraft;
        const copy = (await page.annotations.create(data, { appearance })).created;
        expectSameDrawing(await rasterOf(page, copy.ref), shown);
      });
    });

    /** Export, make a copy from the export, export the copy: `rounds` times. */
    const exportCycles = async (page: PageHandle, stamp: AnnotationDTO, rounds: number) => {
      const drawings = [await page.annotations.readResource(stamp.ref, 'appearance')];
      const data = JSON.parse(JSON.stringify(stamp)) as AnnotationDraft;
      for (let round = 0; round < rounds; round++) {
        const appearance = drawings[drawings.length - 1]!;
        const copy = (await page.annotations.create(data, { appearance })).created;
        drawings.push(await page.annotations.readResource(copy.ref, 'appearance'));
      }
      return drawings;
    };

    test('a drawing exported again after an import is the same bytes', async () => {
      await onPage('authoring', async (page) => {
        const vector = (
          await page.annotations.create(
            {
              subtype: 'stamp',
              rect: { left: 20, bottom: 20, right: 220, top: 120 },
              fit: 'contain',
            },
            { appearance: BANDS_PDF },
          )
        ).created;
        const image = (
          await page.annotations.create(
            {
              subtype: 'stamp',
              rect: { left: 20, bottom: 140, right: 120, top: 240 },
              fit: 'cover',
            },
            { appearance: BANDS_PNG },
          )
        ).created;
        for (const stamp of [vector, image]) {
          const [first, ...again] = await exportCycles(page, stamp, 3);
          for (const drawing of again) expect(sameBytes(drawing, first!)).toBe(true);
        }
      });
      await onPage('acrobat-stamps', async (page) => {
        for (const stamp of await acrobatStamps(page)) {
          const [first, ...again] = await exportCycles(page, stamp, 2);
          for (const drawing of again) expect(sameBytes(drawing, first!)).toBe(true);
        }
      });
    });

    test('an image is the same drawing in any box', async () => {
      await onPage('authoring', async (page) => {
        const square = (
          await page.annotations.create(
            {
              subtype: 'stamp',
              rect: { left: 20, bottom: 20, right: 120, top: 120 },
              fit: 'contain',
            },
            { appearance: BANDS_PNG },
          )
        ).created;
        const wide = (
          await page.annotations.create(
            {
              subtype: 'stamp',
              rect: { left: 20, bottom: 140, right: 320, top: 240 },
              fit: 'cover',
            },
            { appearance: BANDS_PNG },
          )
        ).created;
        const a = await page.annotations.readResource(square.ref, 'appearance');
        const b = await page.annotations.readResource(wide.ref, 'appearance');
        expect(sameBytes(a, b)).toBe(true);
        // The image at its own size: a pixel is a point.
        expect(pageSize(a)).toEqual([30, 10]);
      });
    });

    test('a cover stamp set to contain shows the whole image', async () => {
      await onPage('authoring', async (page) => {
        const stamp = (
          await page.annotations.create(
            {
              subtype: 'stamp',
              rect: { left: 20, bottom: 20, right: 120, top: 120 },
              fit: 'cover',
            },
            { appearance: BANDS_PNG },
          )
        ).created;
        const { updated } = await page.annotations.update(stamp.ref, { fit: 'contain' });
        const raster = await rasterOf(page, updated.ref);
        const y = Math.floor(raster.height / 2);
        const colour = (fx: number) => {
          const i = (y * raster.width + Math.floor(raster.width * fx)) * 4;
          return [raster.rgba[i], raster.rgba[i + 1], raster.rgba[i + 2]];
        };
        // Red, green and blue bands, letterboxed: not only the green the cover showed.
        expect(colour(0.15)).toEqual([255, 0, 0]);
        expect(colour(0.5)).toEqual([0, 255, 0]);
        expect(colour(0.85)).toEqual([0, 0, 255]);
      });
    });

    test('an exported drawing is the drawing and nothing else', async () => {
      await onPage('authoring', async (page) => {
        const stamp = (
          await page.annotations.create(
            {
              subtype: 'stamp',
              rect: { left: 20, bottom: 20, right: 220, top: 120 },
              opacity: 0.5,
            },
            { appearance: BANDS_PDF },
          )
        ).created;
        const text = new TextDecoder('latin1').decode(
          await page.annotations.readResource(stamp.ref, 'appearance'),
        );
        // No /Info with a creation date, nothing of how our wrapper placed it.
        expect(text.includes('/Info')).toBe(false);
        expect(text.includes('CreationDate')).toBe(false);
        expect(text.includes('EPDFOrigContentRect')).toBe(false);
        expect(text.includes('EPDFWRAP')).toBe(false);
      });
    });

    test('a role the kind does not take is refused', async () => {
      await onPage('authoring', async (page) => {
        const rect: PdfRect = { left: 300, bottom: 300, right: 360, top: 340 };
        const refused = { code: EngineErrorCode.InvalidArg };
        const square = (await page.annotations.create({ subtype: 'square', rect })).created;
        await expect(page.annotations.readResource(square.ref, 'appearance')).rejects.toMatchObject(
          refused,
        );
        const stamp = (
          await page.annotations.create({ subtype: 'stamp', rect }, { appearance: BANDS_PDF })
        ).created;
        await expect(page.annotations.readResource(stamp.ref, 'file')).rejects.toMatchObject(
          refused,
        );
      });
    });
  });
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** A 30 × 10 PNG: red, green and blue bands, so a crop or a wrong fit shows. */
const BANDS_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAIAAAAsFXl4AAAAGklEQVR42mP4z8CABzFQIj1q9KjRo0aTIg0AQXcq5OunV0AAAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** A one-page PDF, 200 × 100: a red band and a blue band, so a wrong fit or crop shows. */
const BANDS_PDF = (() => {
  const content = '1 0 0 rg 0 0 120 100 re f 0 0 1 rg 120 0 80 100 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let text = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
})();

/**
 * A read without what a copy doesn't take from its data: where it is, and the
 * attribution, which the engine writes for whoever makes the copy.
 */
function dataOf(dto: AnnotationDTO): Record<string, unknown> {
  const {
    ref: _ref,
    index: _index,
    author: _author,
    createdAt: _createdAt,
    modifiedAt: _modifiedAt,
    userId: _userId,
    createdBy: _createdBy,
    modifiedBy: _modifiedBy,
    ...data
  } = dto;
  return data;
}

/** The width and height of a one-page PDF's page. */
function pageSize(pdf: Uint8Array): [number, number] | null {
  const text = new TextDecoder('latin1').decode(pdf);
  const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);
  return box ? [Number(box[3]) - Number(box[1]), Number(box[4]) - Number(box[2])] : null;
}

interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel, no row padding. */
  rgba: Uint8Array;
}

async function appearanceRaster(
  page: PageHandle,
  ref: AnnotationRef,
  raw: boolean,
): Promise<Raster> {
  const key = annotationKey(ref);
  if (raw) {
    const { appearances } = await page.annotations.renderAppearances({ scale: 1 });
    const found = appearances.find((a) => annotationKey(a.ref) === key && a.mode === 'normal');
    if (!found) throw new Error(`no appearance rendered for ${key}`);
    const { raster } = found;
    const bytes = new Uint8Array(raster.data);
    const rgba = new Uint8Array(raster.width * raster.height * 4);
    for (let y = 0; y < raster.height; y++) {
      rgba.set(
        bytes.subarray(y * raster.stride, y * raster.stride + raster.width * 4),
        y * raster.width * 4,
      );
    }
    return { width: raster.width, height: raster.height, rgba };
  }
  const { appearances } = await page.annotations.renderAppearanceImages({
    format: 'png',
    scale: 1,
  });
  const found = appearances.find((a) => annotationKey(a.ref) === key && a.mode === 'normal');
  if (!found || found.image.source.kind !== 'bytes') {
    throw new Error(`no appearance image rendered for ${key}`);
  }
  return decodePng(found.image.source.bytes);
}

function maxAlpha(raster: Raster): number {
  let max = 0;
  for (let i = 3; i < raster.rgba.length; i += 4) max = Math.max(max, raster.rgba[i]!);
  return max;
}

function maxDifference(a: Raster, b: Raster): number {
  let max = 0;
  for (let i = 0; i < a.rgba.length; i++) max = Math.max(max, Math.abs(a.rgba[i]! - b.rgba[i]!));
  return max;
}

/** An 8-bit, non-interlaced RGB or RGBA PNG as RGBA. Enough for the engines' own encoders. */
async function decodePng(png: Uint8Array): Promise<Raster> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const data: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (body[8] !== 8 || body[12] !== 0) throw new Error('only 8-bit non-interlaced PNGs');
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`unsupported PNG color type ${body[9]}`);
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }
  const compressed = new Blob(data as BlobPart[]);
  const inflated = new Uint8Array(
    await new Response(
      compressed.stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer(),
  );
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)]!;
    const line = inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const predictor =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? (left + up) >> 1
              : filter === 4
                ? paeth(left, up, upLeft)
                : 0;
      pixels[y * stride + x] = (line[x]! + predictor) & 0xff;
    }
  }
  if (channels === 4) return { width, height, rgba: pixels };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba.set(pixels.subarray(i, i + 3), j);
    rgba[j + 3] = 255;
  }
  return { width, height, rgba };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function firstPage(doc: DocumentHandle): Promise<PageRef> {
  const { pages } = await doc.pages.list();
  if (!pages[0]) throw new Error('the document has no pages');
  return toPageRef(pages[0].ref.pageObjectNumber);
}
