import type { PageTextObject, PageTextObjectsSnapshot } from '../dto/PageTextObjectsSnapshot';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { toPageRef } from '../identity/PageRef';
import { PageTextObjectsSnapshotSchema } from '../wire/schemas';
import { EVERY_PERMISSION } from './fixtureScope';
import { pdfOfParts } from './pdfOf';
import type { ConformanceOptions, ConformanceTestRunner } from './runMetadataConformance';

const CONTENT = [
  // Two text objects in one marked-content sequence.
  '/P <</MCID 0>> BDC',
  'BT /F1 12 Tf 72 700 Td (Hello) Tj ET',
  'BT /F1 12 Tf 72 686 Td (World) Tj ET',
  'EMC',
  // A path, marked as an artifact.
  '/Artifact BMC 72 600 m 200 600 l S EMC',
  // Another font, in a sequence of its own.
  '/Span <</MCID 1>> BDC',
  'BT /F2 10 Tf 2 0 0 2 72 650 Tm (Mono) Tj ET',
  'EMC',
  // A form XObject drawn inside a sequence: its text inherits it.
  '/P <</MCID 2>> BDC /Fm1 Do EMC',
].join('\n');

const FORM = 'BT /F1 8 Tf 72 560 Td (Form) Tj ET';

/** Page 3 0 R, drawing the content above with Helvetica (F1) and Courier (F2). */
export const PAGE_TEXT_OBJECTS_FIXTURE_PDF: Uint8Array = pdfOfParts([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R' +
    ' /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Fm1 7 0 R >> >> >>',
  { dictionary: '', data: new TextEncoder().encode(CONTENT) },
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  {
    dictionary:
      '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >>',
    data: new TextEncoder().encode(FORM),
  },
]);

const PAGE = toPageRef(3);
const TOLERANCE = 1e-3;

export type PageTextObjectsConformanceOptions = Pick<ConformanceOptions, 'label' | 'makeEngine'>;

/**
 * `PageHandle.text.objects()`: page objects in content order, marked-content
 * stacks with shared sequence identity, form XObjects flattened in place,
 * fonts, matrices and glyphs in drawing order.
 */
export function runPageTextObjectsConformance(
  runner: ConformanceTestRunner,
  options: PageTextObjectsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page text objects conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const open = () =>
      engine.open(
        { kind: 'bytes', id: 'page-text-objects', bytes: PAGE_TEXT_OBJECTS_FIXTURE_PDF.slice() },
        EVERY_PERMISSION,
      );

    const read = async (): Promise<PageTextObjectsSnapshot> => {
      const doc = await open();
      try {
        return await doc.page(PAGE).text.objects();
      } finally {
        await doc.close();
      }
    };

    const textOf = (object: PageTextObject) => object.glyphs.map((g) => g.unicode).join('');
    const texts = (snapshot: PageTextObjectsSnapshot) =>
      snapshot.objects.filter((o): o is PageTextObject => o.kind === 'text');

    test('the snapshot round-trips the wire schema', async () => {
      const snapshot = await read();
      const parsed = PageTextObjectsSnapshotSchema.safeParse(snapshot);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(snapshot);
    });

    test('objects come in content order, form XObjects flattened in place', async () => {
      const snapshot = await read();
      expect(snapshot.objects.map((o) => o.kind)).toEqual(['text', 'text', 'path', 'text', 'text']);
      expect(texts(snapshot).map(textOf)).toEqual(['Hello', 'World', 'Mono', 'Form']);
    });

    test('marked-content stacks keep sequence identity, tags and MCIDs', async () => {
      const snapshot = await read();
      const stacks = snapshot.objects.map((o) =>
        o.marks.map((m) => ({ ...snapshot.marks[m], id: m })),
      );
      // One sequence around both text objects: the same entry.
      expect(stacks[0]).toEqual(stacks[1]);
      expect(stacks[0].map(({ tag, mcid }) => ({ tag, mcid }))).toEqual([{ tag: 'P', mcid: 0 }]);
      expect(stacks[2].map(({ tag, mcid }) => ({ tag, mcid }))).toEqual([
        { tag: 'Artifact', mcid: undefined },
      ]);
      expect(stacks[3].map(({ tag, mcid }) => ({ tag, mcid }))).toEqual([{ tag: 'Span', mcid: 1 }]);
      // The form's text sits in the sequence around `Do`; a new sequence with
      // the same tag is a new entry.
      expect(stacks[4][0].tag).toBe('P');
      expect(stacks[4][0].mcid).toBe(2);
      expect(stacks[4][0].id === stacks[0][0].id).toBe(false);
    });

    test('text objects carry their font, size and matrix', async () => {
      const snapshot = await read();
      const [hello, , mono] = texts(snapshot);
      expect(hello.fontSize).toBe(12);
      expect(hello.matrix).toEqual([1, 0, 0, 1, 72, 700]);
      expect(mono.fontSize).toBe(10);
      expect(mono.matrix).toEqual([2, 0, 0, 2, 72, 650]);
      const helvetica = snapshot.fonts[hello.font];
      const courier = snapshot.fonts[mono.font];
      expect(helvetica.baseName).toBe('Helvetica');
      expect(helvetica.monospace).toBe(false);
      expect(courier.baseName).toBe('Courier');
      expect(courier.monospace).toBe(true);
      expect(helvetica.ascent > 0).toBe(true);
      expect(helvetica.descent < 0).toBe(true);
      // Both Helvetica objects (and the form's) share one font entry.
      expect(new Set(texts(snapshot).map((o) => o.font)).size).toBe(2);
    });

    test('glyphs run in pen order and index the page characters', async () => {
      const snapshot = await read();
      const doc = await open();
      let charCount: number;
      try {
        charCount = (await doc.page(PAGE).text.get()).charCount;
      } finally {
        await doc.close();
      }
      const seen = new Set<number>();
      for (const object of texts(snapshot)) {
        expect(object.reversed).toBe(undefined);
        object.glyphs.forEach((glyph, k) => {
          expect(glyph.index < charCount).toBe(true);
          expect(seen.has(glyph.index)).toBe(false);
          seen.add(glyph.index);
          expect(glyph.advance > 0).toBe(true);
          const next = object.glyphs[k + 1];
          if (next) {
            const step = next.origin.x - glyph.origin.x;
            expect(Math.abs(step - glyph.advance) < TOLERANCE).toBe(true);
          }
        });
      }
      const [hello] = texts(snapshot);
      expect(Math.abs(hello.glyphs[0].origin.x - 72) < TOLERANCE).toBe(true);
      expect(Math.abs(hello.glyphs[0].origin.y - 700) < TOLERANCE).toBe(true);
    });

    test('an unknown page throws NotFound', async () => {
      const doc = await open();
      try {
        let caught: unknown;
        try {
          await doc.page(toPageRef(999_999_999)).text.objects();
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('a read after close throws DocNotOpen', async () => {
      const doc = await open();
      const page = doc.page(PAGE);
      await doc.close();
      let caught: unknown;
      try {
        await page.text.objects();
      } catch (err) {
        caught = err;
      }
      expect(EngineError.is(caught, EngineErrorCode.DocNotOpen)).toBe(true);
    });
  });
}
