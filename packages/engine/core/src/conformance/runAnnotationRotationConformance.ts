import { decodePng, type Raster } from './appearanceRasters';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { AnnotationDTO } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import type { PdfRect } from '../geometry/primitives';
import { pdfRectTurnedBounds } from '../geometry/convert';
import { annotationKey } from '../identity/annotationKey';

export type AnnotationRotationFixture =
  /** A one-page document without annotations. */
  | 'authoring'
  /** A stamp Acrobat turned 36° clockwise: `/Rotate -36`, the turn in its appearance. */
  | 'acrobat-stamp-rotated'
  /** A text box Acrobat added on a turned page (`/Rotate 90`), and one upright. */
  | 'acrobat-freetext-rotated';

export interface AnnotationRotationConformanceOptions {
  label: string;
  /** Build a fresh engine for this suite. The suite tears it down at the end. */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of a fixture. */
  open: (engine: Engine, fixture: AnnotationRotationFixture) => Promise<DocumentHandle>;
}

type Stamp = Extract<AnnotationDTO, { subtype: 'stamp' }>;
type FreeText = Extract<AnnotationDTO, { subtype: 'free-text' }>;

/**
 * An annotation's `rotation` is degrees clockwise, as every rotation in the
 * API, on both engines. What's drawn decides it: a turn another app made
 * (Acrobat's `/Rotate` stamps and quarter-turned text boxes) reads as ours
 * does, with the `box` the drawing turns, and a write keeps it. A turned
 * box's `rect` is the upright box around all it draws, which the engine
 * works out.
 */
export function runAnnotationRotationConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationRotationConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation rotation conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const onPage = async (
      fixture: AnnotationRotationFixture,
      run: (page: PageHandle) => Promise<void>,
    ): Promise<void> => {
      const doc = await opts.open(engine, fixture);
      try {
        const { pages } = await doc.pages.list();
        await run(doc.page(pages[0]!.ref));
      } finally {
        await doc.close();
      }
    };

    const expectRect = (actual: PdfRect | null, expected: PdfRect, tolerance: number) => {
      expect(actual !== null).toBe(true);
      for (const edge of ['left', 'bottom', 'right', 'top'] as const) {
        expect(Math.abs(actual![edge] - expected[edge]) <= tolerance).toBe(true);
      }
    };

    const stampOf = async (page: PageHandle): Promise<Stamp> => {
      const { annotations } = await page.annotations.list();
      const stamp = annotations.find((a): a is Stamp => a.subtype === 'stamp');
      if (!stamp) throw new Error('no stamp');
      return stamp;
    };

    const textBoxOf = async (page: PageHandle, contents: string): Promise<FreeText> => {
      const { annotations } = await page.annotations.list();
      const box = annotations.find(
        (a): a is FreeText => a.subtype === 'free-text' && a.contents === contents,
      );
      if (!box) throw new Error(`no text box ${JSON.stringify(contents)}`);
      return box;
    };

    const appearanceOf = async (page: PageHandle, ref: AnnotationDTO['ref']): Promise<Raster> => {
      const { appearances } = await page.annotations.renderAppearances({ format: 'png' });
      const found = appearances.find(
        (a) => a.mode === 'normal' && annotationKey(a.ref) === annotationKey(ref),
      );
      if (!found) throw new Error('no appearance');
      const { url, revoke } = await found.image.objectUrl();
      try {
        return await decodePng(new Uint8Array(await (await fetch(url)).arrayBuffer()));
      } finally {
        revoke();
      }
    };

    test('a stamp Acrobat turned reads its turn and its own box', async () => {
      await onPage('acrobat-stamp-rotated', async (page) => {
        const stamp = await stampOf(page);
        expect(stamp.rotation).toBe(36);
        // Acrobat stores no box: it's the drawing's own, stretched onto /Rect.
        expectRect(
          stamp.box,
          { left: 155.784, bottom: 508.966, right: 466.366, top: 618.542 },
          0.02,
        );
        expectRect(
          stamp.rect,
          { left: 153.238, bottom: 428.152, right: 468.912, top: 699.356 },
          0.01,
        );
      });
    });

    test('a text box Acrobat turned a quarter reads its turn', async () => {
      await onPage('acrobat-freetext-rotated', async (page) => {
        const turned = await textBoxOf(page, 'test 123');
        // /Rotate 90 is counterclockwise: the text reads from the bottom up.
        expect(turned.rotation).toBe(270);
        expectRect(
          turned.box,
          { left: 233.423, bottom: 309.413, right: 341.423, top: 341.423 },
          0.01,
        );
        const upright = await textBoxOf(page, 'test\rtest 123');
        expect(upright.rotation).toBeNull();
        expectRect(upright.box, upright.rect, 0);
      });
    });

    test('a change to a text box Acrobat turned keeps it turned', async () => {
      await onPage('acrobat-freetext-rotated', async (page) => {
        const turned = await textBoxOf(page, 'test 123');
        const { annotation } = await page.annotations.update(turned.ref, {
          subtype: 'free-text',
          color: { r: 200, g: 230, b: 255 },
        });
        const updated = annotation as FreeText;
        expect(updated.rotation).toBe(270);
        expectRect(updated.box, turned.box, 0.01);
        expectRect(updated.rect, turned.rect, 0.01);
        // Turned back, the text box is wide: its text still runs along it.
        const raster = await appearanceOf(page, updated.ref);
        expect(raster.width > 2 * raster.height).toBe(true);
      });
    });

    test('moving a stamp Acrobat turned turns it once', async () => {
      await onPage('acrobat-stamp-rotated', async (page) => {
        const stamp = await stampOf(page);
        const moved = { ...stamp.box, left: stamp.box.left + 40, right: stamp.box.right + 40 };
        const { annotation } = await page.annotations.update(stamp.ref, {
          subtype: 'stamp',
          box: moved,
          rotation: stamp.rotation,
        });
        const updated = annotation as Stamp;
        expect(updated.rotation).toBe(36);
        expectRect(updated.box, moved, 0.02);
        expectRect(
          updated.rect,
          { ...stamp.rect, left: stamp.rect.left + 40, right: stamp.rect.right + 40 },
          0.02,
        );
        // Its drawing is upright under the turn: the wide stamp, not its turn.
        const drawing = await page.annotations.downloadResource(updated.ref, 'appearance');
        const [width, height] = pageSize(drawing);
        expect(Math.abs(width / height - 906.89 / 319.96) < 0.01).toBe(true);
      });
    });

    test("a turned box's rect is the upright box around it", async () => {
      await onPage('authoring', async (page) => {
        const { annotation } = await page.annotations.create({
          subtype: 'square',
          box: { left: 100, bottom: 100, right: 300, top: 300 },
          rotation: 30,
        });
        // 200 × 200 turned 30° is 273.2 across, about the same middle.
        expectRect(
          annotation.rect,
          { left: 63.397, bottom: 63.397, right: 336.603, top: 336.603 },
          0.01,
        );
        expect((annotation as { rotation: number | null }).rotation).toBe(30);
      });
    });

    test('a turned drawing that reaches past its box is drawn as the page shows it', async () => {
      await onPage('authoring', async (page) => {
        const box = { left: 200, bottom: 400, right: 300, top: 460 };
        const { annotation: plain } = await page.annotations.create({
          subtype: 'square',
          box,
          rotation: 30,
        });
        const { annotation: cloudy } = await page.annotations.create({
          subtype: 'square',
          box: { ...box, bottom: 200, top: 260 },
          rotation: 30,
          cloudyIntensity: 1,
          strokeWidth: 2,
        });
        // The bumps reach past the turned box: `rect` takes them in.
        const turned = pdfRectTurnedBounds(box, 30);
        expectRect(plain.rect, turned, 0.01);
        expect(cloudy.rect.right - cloudy.rect.left > turned.right - turned.left + 2).toBe(true);
        // Inside its turned box, a drawing renders upright over its box, for
        // the consumer to turn. Past it, it renders as the page shows it.
        const { appearances } = await page.annotations.renderAppearances();
        const rectOf = (ref: AnnotationDTO['ref']) =>
          appearances.find(
            (a) => a.mode === 'normal' && annotationKey(a.ref) === annotationKey(ref),
          )!.rect;
        expectRect(rectOf(plain.ref), (plain as { box: PdfRect }).box, 0.01);
        expectRect(rectOf(cloudy.ref), cloudy.rect, 0.01);
      });
    });

    test('rotation turns clockwise, as the page shows it', async () => {
      await onPage('authoring', async (page) => {
        const box = { left: 200, bottom: 400, right: 300, top: 500 };
        await page.annotations.create({
          subtype: 'square',
          box,
          rotation: 30,
          color: { r: 0, g: 0, b: 255 },
          interiorColor: { r: 0, g: 0, b: 255 },
        });
        // A square turned clockwise has its highest corner left of its middle.
        const area = { left: 150, bottom: 350, right: 350, top: 550 };
        const image = await page.render.image({
          format: 'png',
          target: { kind: 'rect', rect: area },
        });
        const { url, revoke } = await image.objectUrl();
        let raster: Raster;
        try {
          raster = await decodePng(new Uint8Array(await (await fetch(url)).arrayBuffer()));
        } finally {
          revoke();
        }
        const top = highestInk(raster);
        expect(top !== null).toBe(true);
        expect(top! < raster.width / 2).toBe(true);
      });
    });
  });
}

/** The x of the first pixel, from the top, that isn't white; `null` when none is. */
function highestInk(raster: Raster): number | null {
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const at = (y * raster.width + x) * 4;
      const [r, g, b] = [raster.rgba[at]!, raster.rgba[at + 1]!, raster.rgba[at + 2]!];
      if (r < 128 && g < 128 && b > 128) return x;
    }
  }
  return null;
}

function pageSize(pdf: Uint8Array): [number, number] {
  const text = new TextDecoder('latin1').decode(pdf);
  const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);
  if (!box) throw new Error('no /MediaBox');
  return [Number(box[3]) - Number(box[1]), Number(box[4]) - Number(box[2])];
}
