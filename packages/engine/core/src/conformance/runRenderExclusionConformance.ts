import type { ConformanceTestRunner, ConformanceOptions } from './runMetadataConformance';
import type { SquareDraft } from '../annotation/kinds';
import type { PageRenderRaster } from '../dto/PageRender';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { isLocalPage } from '../engine/LocalPageHandle';
import { annotationKey } from '../identity/annotationKey';
import { EVERY_PERMISSION } from './fixtureScope';

const square = (x: number, y: number, color: string): SquareDraft => ({
  subtype: 'square',
  box: { x, y, width: 40, height: 40 },
  color,
  interiorColor: color,
  strokeWidth: 2,
});

/** The pixel at a page-space point of a scale-1, unrotated whole-page raster. */
function pixel(raster: PageRenderRaster, x: number, y: number): number[] {
  const data = new Uint8Array(raster.data);
  const at = Math.round(y) * raster.stride + Math.round(x) * 4;
  return [data[at]!, data[at + 1]!, data[at + 2]!];
}

/**
 * Local engines: `page.render.raw({ excludeAnnotations })` draws the page
 * without the given annotations and with the others, and
 * `page.annotations.renderAppearancesRaw({ refs })` renders only the given
 * ones; `page.annotations.readAppearanceText(ref)` reads the text an
 * appearance shows. Locks:
 *   1. an excluded annotation is not drawn, another one still is;
 *   2. excluding a ref that isn't on the page draws what a plain render does;
 *   3. `refs` gives one appearance per named annotation;
 *   4. `readAppearanceText(ref)` gives the lines an appearance shows and its
 *      first glyph's origin, in page space.
 * Skips on an engine whose pages aren't local.
 */
export function runRenderExclusionConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`render exclusion conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    test('leaves out the excluded annotations and draws the others', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page((await doc.pages.list()).pages[0].ref);
        if (!isLocalPage(page)) return;
        const red = (await page.annotations.create(square(20, 20, '#ff0000'))).annotation.ref;
        const blue = (await page.annotations.create(square(100, 20, '#0000ff'))).annotation.ref;
        const background = 'white' as const;
        const blank = await page.render.raw({ background, includeAnnotations: false });

        const all = await page.render.raw({ background });
        expect(pixel(all, 40, 40)).toEqual([255, 0, 0]);
        expect(pixel(all, 120, 40)).toEqual([0, 0, 255]);

        const withoutRed = await page.render.raw({ background, excludeAnnotations: [red] });
        expect(pixel(withoutRed, 120, 40)).toEqual([0, 0, 255]);
        expect(pixel(withoutRed, 40, 40).join()).toBe(pixel(blank, 40, 40).join());

        const foreign = { ...red, objectNumber: red.kind === 'objectNumber' ? 999999 : 0 };
        const none = await page.render.raw({ background, excludeAnnotations: [foreign] });
        expect(pixel(none, 40, 40)).toEqual([255, 0, 0]);
        expect(pixel(none, 120, 40)).toEqual([0, 0, 255]);

        const only = await page.annotations.renderAppearancesRaw({ refs: [blue] });
        expect(only.appearances.map((a) => annotationKey(a.ref))).toEqual([annotationKey(blue)]);
      } finally {
        await doc.close();
      }
    });

    test('reads the text an appearance shows and where its first glyph sits', async () => {
      const doc = await openFixture(engine, opts);
      try {
        const page = doc.page((await doc.pages.list()).pages[0].ref);
        if (!isLocalPage(page)) return;
        const box = { x: 60, y: 300, width: 200, height: 60 };
        const { annotation } = await page.annotations.create({
          subtype: 'free-text',
          box,
          fontSize: 12,
          richText: { paragraphs: [{ runs: [{ text: 'Hello' }] }, { runs: [{ text: 'world' }] }] },
        });
        const text = await page.annotations.readAppearanceText(annotation.ref);
        expect(text.lines).toEqual(['Hello', 'world']);
        const origin = text.firstOrigin!;
        expect(origin.x >= box.x && origin.x < box.x + 40).toBe(true);
        // On the first line's baseline: below the top, above the second line.
        expect(origin.y > box.y && origin.y < box.y + 20).toBe(true);
      } finally {
        await doc.close();
      }
    });
  });
}

async function openFixture(engine: Engine, opts: ConformanceOptions): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open(
      { kind: 'bytes', id: opts.fixture.id, bytes: await opts.fixture.bytes() },
      EVERY_PERMISSION,
    );
  }
  return engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
}
