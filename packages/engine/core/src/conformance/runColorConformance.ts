import type { ConformanceTestRunner } from './runMetadataConformance';
import { pdfOf } from './pdfOf';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { toPageRef } from '../identity/PageRef';

/**
 * One page with a square whose border color the file stores as gray
 * (`/C [0.5]`) and whose fill it stores as CMYK (`/IC [0 0 0 1]`).
 */
export const COLOR_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [4 0 R] >>',
  '<< /Type /Annot /Subtype /Square /Rect [20 20 120 120] /F 4 /C [0.5] /IC [0 0 0 1] /NM (colored) >>',
]);

export interface ColorConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link COLOR_FIXTURE_PDF}, fresh for each call. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/** The numbers of the last `/Key [ … ]` array in a PDF file's text. */
function lastArray(text: string, key: string): number[] | null {
  const matches = [...text.matchAll(new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`, 'g'))];
  const last = matches[matches.length - 1];
  return last ? last[1]!.trim().split(/\s+/).map(Number) : null;
}

/**
 * Colors are `'#rrggbb'`: lowercase when the engine gives one, either case
 * when it takes one. A gray or CMYK color reads as its sRGB equivalent and,
 * sent back unchanged, stays as the file stores it.
 */
export function runColorConformance(
  runner: ConformanceTestRunner,
  opts: ColorConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`color conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const squareOf = async (doc: DocumentHandle) => {
      const { pages } = await doc.pages.list();
      const page = doc.page(toPageRef(pages[0]!.ref.pageObjectNumber));
      const { annotations } = await page.annotations.list();
      const square = annotations.find((a) => a.nm === 'colored');
      if (!square || square.subtype !== 'square') throw new Error('no square in the fixture');
      return { page, square };
    };

    test('a gray or CMYK color reads as its sRGB value, lowercase', async () => {
      const doc = await opts.open(engine);
      try {
        const { square } = await squareOf(doc);
        expect(square.color).toMatch(/^#([0-9a-f]{2})\1\1$/);
        expect(square.interiorColor).toBe('#000000');
      } finally {
        await doc.close();
      }
    });

    test('a color sent back unchanged stays as the file stores it', async () => {
      const doc = await opts.open(engine);
      try {
        const { page, square } = await squareOf(doc);
        // The whole read sent back, the colors in the other case, with one change.
        await page.annotations.update(square.ref, {
          ...square,
          color: square.color.toUpperCase(),
          interiorColor: square.interiorColor?.toUpperCase() ?? null,
          contents: 'kept',
        });
        const text = new TextDecoder('latin1').decode(await doc.download());
        expect(lastArray(text, 'C')).toEqual([0.5]);
        expect(lastArray(text, 'IC')).toEqual([0, 0, 0, 1]);
        const { square: after } = await squareOf(doc);
        expect(after.contents).toBe('kept');
        expect(after.color).toBe(square.color);
      } finally {
        await doc.close();
      }
    });

    test('a new color is written as given, in either case, and reads back lowercase', async () => {
      const doc = await opts.open(engine);
      try {
        const { page, square } = await squareOf(doc);
        const { annotation } = await page.annotations.update(square.ref, { color: '#1A2B3C' });
        expect(annotation.subtype === 'square' && annotation.color).toBe('#1a2b3c');
        const text = new TextDecoder('latin1').decode(await doc.download());
        expect(lastArray(text, 'C')).toHaveLength(3);
      } finally {
        await doc.close();
      }
    });
  });
}
