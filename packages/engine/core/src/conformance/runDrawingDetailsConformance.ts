import type { ConformanceTestRunner } from './runMetadataConformance';
import { iconRect } from './creatables';
import { pdfOf } from './pdfOf';
import type { Annotation } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageBox } from '../geometry/pageSpace';

/**
 * One 300 × 300 page with what other apps write and the engine only reads:
 * a typewriter box (`/IT /FreeTextTypeWriter`) and a square with a beveled
 * border.
 */
export const DRAWING_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Annots [4 0 R 5 0 R] >>',
  '<< /Type /Annot /Subtype /FreeText /IT /FreeTextTypeWriter /Rect [20 240 180 270] /DA (0 0 1 rg /Helv 12 Tf) /Contents (typed) /NM (typewriter) /F 4 >>',
  '<< /Type /Annot /Subtype /Square /Rect [20 20 120 120] /BS << /S /B /W 2 >> /C [1 0 0] /NM (beveled) /F 4 >>',
]);

/** The fixtures the suite opens: its own, and Acrobat's text boxes (`freetext-rotated-acrobat.pdf`). */
export type DrawingDetailsFixture = 'drawing' | 'acrobat-freetext';

export interface DrawingDetailsConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** A fresh copy of `fixture` for each call: the tests write to their documents. */
  open: (engine: Engine, fixture: DrawingDetailsFixture) => Promise<DocumentHandle>;
}

/** The text box Acrobat drew with an orange border and black text. */
const ACROBAT_TEXT_BOX = '6fa6542a-9d84-6143-a7ef-6336cd8816f4';

const BOX: PageBox = { x: 40, y: 40, width: 160, height: 60 };

/**
 * How annotations draw and what a write takes: free text colors and
 * defaults, dashes, the points a shape needs, printing, a note's `open` and
 * its popup, and links.
 */
export function runDrawingDetailsConformance(
  runner: ConformanceTestRunner,
  opts: DrawingDetailsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`drawing details conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const firstPage = async (doc: DocumentHandle) => {
      const { pages } = await doc.pages.list();
      return { page: doc.page(pages[0]!.ref), pageRef: pages[0]!.ref };
    };

    const byNm = async (doc: DocumentHandle, nm: string): Promise<Annotation> => {
      const { page } = await firstPage(doc);
      const found = (await page.annotations.list()).annotations.find((a) => a.nm === nm);
      if (!found) throw new Error(`no annotation '${nm}' in the fixture`);
      return found;
    };

    const invalid = { code: EngineErrorCode.InvalidArg };

    test("Acrobat's text box: the text is its rich text's color, the border its /DA color", async () => {
      const doc = await opts.open(engine, 'acrobat-freetext');
      try {
        const { page } = await firstPage(doc);
        const box = await byNm(doc, ACROBAT_TEXT_BOX);
        if (box.subtype !== 'free-text') throw new Error('expected a free text');
        expect(box.fontColor).toBe('#000000');
        expect(box.color).toBe('#ff6200');
        expect(box.intent).toBe('free-text');
        expect(box.verticalAlign).toBe('top');

        // The border changes; the text keeps its color.
        const bordered = await page.annotations.update(box.ref, { color: '#0000ff' });
        if (bordered.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(bordered.annotation.color).toBe('#0000ff');
        expect(bordered.annotation.fontColor).toBe('#000000');

        // The text changes; the rest of its style stays.
        const colored = await page.annotations.update(box.ref, { fontColor: '#00aa00' });
        if (colored.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(colored.annotation.fontColor).toBe('#00aa00');
        expect(colored.annotation.color).toBe('#0000ff');
        expect(colored.annotation.richText.body.family).toBe(box.richText.body.family);
        expect(colored.annotation.fontSize).toBe(box.fontSize);
      } finally {
        await doc.close();
      }
    });

    test('a free text create takes defaults, and prints', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const { annotation } = await page.annotations.create({
          subtype: 'free-text',
          box: BOX,
          contents: 'Defaults',
        });
        if (annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(annotation).toMatchObject({
          intent: 'free-text',
          fontFamily: 'helvetica',
          fontSize: 12,
          textAlign: 'left',
          verticalAlign: 'top',
          fontColor: '#000000',
          color: '#000000',
          print: true,
        });
      } finally {
        await doc.close();
      }
    });

    test('a callout line makes a callout; another box refuses one', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const calloutLine: [{ x: number; y: number }, { x: number; y: number }] = [
          { x: 20, y: 150 },
          { x: 40, y: 100 },
        ];
        const callout = await page.annotations.create({
          subtype: 'free-text',
          box: BOX,
          contents: 'Look',
          calloutLine,
        });
        if (callout.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(callout.annotation.intent).toBe('free-text-callout');

        await expect(
          page.annotations.create({
            subtype: 'free-text',
            box: BOX,
            intent: 'free-text',
            calloutLine,
          }),
        ).rejects.toMatchObject(invalid);

        const plain = await page.annotations.create({ subtype: 'free-text', box: BOX });
        await expect(
          page.annotations.update(plain.annotation.ref, { calloutLine }),
        ).rejects.toMatchObject(invalid);
        const became = await page.annotations.update(plain.annotation.ref, {
          intent: 'free-text-callout',
          calloutLine,
        });
        if (became.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(became.annotation.intent).toBe('free-text-callout');
      } finally {
        await doc.close();
      }
    });

    test('the text style given by itself wins over the rich body; a partial body merges over the current one', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const created = await page.annotations.create({
          subtype: 'free-text',
          box: BOX,
          fontColor: '#ff0000',
          richText: {
            body: { color: '#0000ff', size: 20 },
            paragraphs: [{ runs: [{ text: 'styled' }] }],
          },
        });
        if (created.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(created.annotation.fontColor).toBe('#ff0000');
        expect(created.annotation.fontSize).toBe(20);

        const italic = await page.annotations.update(created.annotation.ref, {
          richText: { body: { italic: true }, paragraphs: [{ runs: [{ text: 'restyled' }] }] },
        });
        if (italic.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(italic.annotation.richText.body.italic).toBe(true);
        expect(italic.annotation.fontSize).toBe(20);
        expect(italic.annotation.fontColor).toBe('#ff0000');
      } finally {
        await doc.close();
      }
    });

    test('free text justifies, sits in its box, and takes a cloudy border', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const created = await page.annotations.create({
          subtype: 'free-text',
          box: { ...BOX, height: 120 },
          contents: 'A line long enough to wrap onto a second line in its box',
          textAlign: 'justify',
          verticalAlign: 'middle',
          cloudyIntensity: 1,
        });
        if (created.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(created.annotation.textAlign).toBe('justify');
        expect(created.annotation.verticalAlign).toBe('middle');
        expect(created.annotation.cloudyIntensity).toBe(1);

        const moved = await page.annotations.update(created.annotation.ref, {
          verticalAlign: 'bottom',
          cloudyIntensity: null,
        });
        if (moved.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(moved.annotation.verticalAlign).toBe('bottom');
        expect(moved.annotation.cloudyIntensity).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test("another app's typewriter box is read and kept, not created", async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const typewriter = await byNm(doc, 'typewriter');
        if (typewriter.subtype !== 'free-text') throw new Error('expected a free text');
        expect(typewriter.intent).toBe('free-text-typewriter');

        const retyped = await page.annotations.update(typewriter.ref, {
          intent: typewriter.intent,
          contents: 'retyped',
        });
        if (retyped.annotation.subtype !== 'free-text') throw new Error('expected a free text');
        expect(retyped.annotation.intent).toBe('free-text-typewriter');

        await expect(
          page.annotations.create({
            subtype: 'free-text',
            box: BOX,
            intent: 'free-text-typewriter',
          } as never),
        ).rejects.toMatchObject(invalid);
      } finally {
        await doc.close();
      }
    });

    test('borders: only a widget writes beveled or inset; a pattern alone keeps a border solid', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        await expect(
          page.annotations.create({ subtype: 'square', box: BOX, borderStyle: 'beveled' } as never),
        ).rejects.toMatchObject(invalid);

        // Another app's beveled border is read and, sent back, kept.
        const beveled = await byNm(doc, 'beveled');
        if (beveled.subtype !== 'square') throw new Error('expected a square');
        expect(beveled.borderStyle).toBe('beveled');
        const kept = await page.annotations.update(beveled.ref, {
          borderStyle: beveled.borderStyle,
          contents: 'kept',
        });
        if (kept.annotation.subtype !== 'square') throw new Error('expected a square');
        expect(kept.annotation.borderStyle).toBe('beveled');
        await expect(
          page.annotations.update(beveled.ref, { borderStyle: 'inset' } as never),
        ).rejects.toMatchObject(invalid);

        const patterned = await page.annotations.create({
          subtype: 'square',
          box: BOX,
          borderStyle: 'solid',
          dashArray: [2, 2],
        });
        if (patterned.annotation.subtype !== 'square') throw new Error('expected a square');
        expect(patterned.annotation.borderStyle).toBe('solid');
        expect(patterned.annotation.dashArray).toEqual([2, 2]);

        const dashed = await page.annotations.create({
          subtype: 'square',
          box: BOX,
          borderStyle: 'dashed',
        });
        if (dashed.annotation.subtype !== 'square') throw new Error('expected a square');
        expect(dashed.annotation.borderStyle).toBe('dashed');
        expect(dashed.annotation.dashArray).toBe(null);
      } finally {
        await doc.close();
      }
    });

    test('too few points to draw is InvalidArg', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const point = { x: 50, y: 50 };
        const other = { x: 90, y: 90 };
        for (const draft of [
          { subtype: 'polyline', vertices: [point] },
          { subtype: 'polygon', vertices: [point, other] },
          { subtype: 'ink', inkList: [] },
          { subtype: 'ink', inkList: [[point, other], []] },
          { subtype: 'ink', inkList: [[point, other]], strokeWidth: 0 },
        ]) {
          await expect(page.annotations.create(draft as never)).rejects.toMatchObject(invalid);
        }
      } finally {
        await doc.close();
      }
    });

    test('a new annotation prints, a popup does not', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const square = await page.annotations.create({ subtype: 'square', box: BOX });
        expect(square.annotation.print).toBe(true);
        const unprinted = await page.annotations.create({
          subtype: 'square',
          box: BOX,
          print: false,
        });
        expect(unprinted.annotation.print).toBe(false);
        const popup = await page.annotations.create({
          subtype: 'popup',
          parent: square.annotation.ref,
          rect: { x: 210, y: 40, width: 80, height: 60 },
        });
        expect(popup.annotation.print).toBe(false);
      } finally {
        await doc.close();
      }
    });

    test('a note and its popup share one open; a second popup is refused', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page } = await firstPage(doc);
        const note = await page.annotations.create({
          subtype: 'text',
          rect: iconRect(40, 40),
          open: true,
        });
        if (note.annotation.subtype !== 'text') throw new Error('expected a note');
        expect(note.annotation.open).toBe(true);

        // A popup made without `open` takes the note's.
        const popup = await page.annotations.create({
          subtype: 'popup',
          parent: note.annotation.ref,
          rect: { x: 70, y: 40, width: 120, height: 80 },
        });
        if (popup.annotation.subtype !== 'popup') throw new Error('expected a popup');
        expect(popup.annotation.open).toBe(true);

        const readBoth = async () => {
          const { annotations } = await page.annotations.list();
          const find = (ref: Annotation['ref']) =>
            annotations.find((a) => JSON.stringify(a.ref) === JSON.stringify(ref));
          return { note: find(note.annotation.ref), popup: find(popup.annotation.ref) };
        };

        // Writing one writes the other, and the result names both.
        const closed = await page.annotations.update(note.annotation.ref, { open: false });
        expect(closed.meta.changed).toHaveLength(2);
        let both = await readBoth();
        expect(both.note?.subtype === 'text' && both.note.open).toBe(false);
        expect(both.popup?.subtype === 'popup' && both.popup.open).toBe(false);

        await page.annotations.update(popup.annotation.ref, { open: true });
        both = await readBoth();
        expect(both.note?.subtype === 'text' && both.note.open).toBe(true);

        await expect(
          page.annotations.create({
            subtype: 'popup',
            parent: note.annotation.ref,
            rect: { x: 70, y: 140, width: 120, height: 80 },
          }),
        ).rejects.toMatchObject(invalid);
      } finally {
        await doc.close();
      }
    });

    test('links: page verbs are written, a missing fit coordinate stays missing, no border', async () => {
      const doc = await opts.open(engine, 'drawing');
      try {
        const { page, pageRef } = await firstPage(doc);
        const next = await page.annotations.create({
          subtype: 'link',
          rect: BOX,
          target: { kind: 'named', name: 'NextPage' },
        });
        if (next.annotation.subtype !== 'link') throw new Error('expected a link');
        expect(next.annotation.target).toEqual({ kind: 'named', name: 'NextPage' });

        const fit = await page.annotations.create({
          subtype: 'link',
          rect: { ...BOX, y: 120 },
          target: { kind: 'goto', destination: { kind: 'fitH', page: pageRef, y: null } },
        });
        if (fit.annotation.subtype !== 'link') throw new Error('expected a link');
        expect(fit.annotation.target).toEqual({
          kind: 'goto',
          destination: { kind: 'fitH', page: pageRef, y: null },
        });

        const text = new TextDecoder('latin1').decode(await doc.download());
        expect(text).toMatch(/\/Border\s*\[\s*0\s+0\s+0\s*\]/);
        expect(/\/FitH\s+0\s*\]/.test(text)).toBe(false);
      } finally {
        await doc.close();
      }
    });
  });
}
