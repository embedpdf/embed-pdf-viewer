import { pdfWithFontDictionaries } from './documentFontFixtures';
import { drawnTextOf } from './drawnText';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { Font } from '../dto/DocumentFonts';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';

export interface DocumentFontsConformanceOptions {
  label: string;
  /**
   * An engine with a font of its own (the server's on the cloud, one
   * registered locally): {@link servedFont}, a fallback whose program may go
   * to browsers, tried before the default fallbacks.
   */
  makeEngine: () => Promise<Engine> | Engine;
  /** Open `bytes`, fresh for each call, with every right. */
  open: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
  /** Open `bytes` with the rights to open and read it only (`doc.open`, `doc.render`). */
  openReadOnly: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
  /** The engine's own font: its key and the SHA-256 (hex) of its program, Roboto Regular. */
  servedFont: { key: string; sha256: string };
  fixtures: {
    /** One page, no form. */
    page: Uint8Array;
    /** A form whose fields are in an embedded CFF program (FoxitFixed) and Type 1 one (Roboto2-Regular). */
    keptFonts: Uint8Array;
    /** A free text box in a Helvetica subset the document embeds. */
    documentSubset: Uint8Array;
    /**
     * A form whose /DR holds two Type 1 dictionaries that read one bare CFF
     * program (FoxitFixed) with other widths, 600 and 900.
     */
    sharedProgram: Uint8Array;
    /**
     * A whole TrueType program that maps Unicode and allows editing (Noto Sans
     * Hebrew Regular): the font the name fixtures embed under other names.
     */
    fontProgram: Uint8Array;
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function rejection(
  promise: PromiseLike<unknown>,
): Promise<{ code?: string; details?: unknown }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; details?: unknown };
  }
  throw new Error('expected a rejection');
}

/** The advance widths an sfnt's `hmtx` table gives its glyphs. */
function advancesOf(font: Uint8Array): Set<number> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tableAt = (tag: string): number => {
    for (let record = 12; record < 12 + view.getUint16(4) * 16; record += 16) {
      if (String.fromCharCode(...font.subarray(record, record + 4)) === tag) {
        return view.getUint32(record + 8);
      }
    }
    throw new Error(`no ${tag} table`);
  };
  const metrics = view.getUint16(tableAt('hhea') + 34);
  const hmtx = tableAt('hmtx');
  return new Set(Array.from({ length: metrics }, (_, glyph) => view.getUint16(hmtx + glyph * 4)));
}

const fontNamed = (fonts: readonly Font[], name: string): Font | undefined =>
  fonts.find((font) => font.name === name);

const covers = (ranges: readonly { start: number; count: number }[], character: string) =>
  ranges.some(
    (range) =>
      range.start <= character.codePointAt(0)! &&
      character.codePointAt(0)! < range.start + range.count,
  );

const HEX_SHA256 = /^[0-9a-f]{64}$/;

/**
 * A document's fonts (`doc.fonts`), the same on every engine:
 *
 * - The list names the 14 standard fonts, then the engine's (the served font
 *   among them, and the fallbacks in the order they're tried), then the
 *   document's own, and the last resort apart.
 * - `resolve` says which program draws each run, and the characters no font
 *   has; a write says the same in `meta.missingCharacters`.
 * - A write that changes the fonts the list shows ends its events with
 *   `fonts.changed`; one that doesn't, doesn't.
 * - Programs download by display hash, for a token that may write text: the
 *   built-in ones, the served font, a document's whole program, and the
 *   display program of a form font a browser can't load.
 * - A document font is everything the PDF draws under one name, however the
 *   editors that wrote it described it: no two share a name, and a box reads
 *   back the name of the font it is drawn in.
 */
export function runDocumentFontsConformance(
  runner: ConformanceTestRunner,
  options: DocumentFontsConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  const { servedFont, fixtures } = options;

  describe(`doc.fonts conformance: ${options.label}`, () => {
    let engine: Engine | undefined;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      await engine?.destroy();
      engine = undefined;
    });

    const open = (bytes: Uint8Array) => options.open(engine!, bytes.slice());
    const firstPage = async (doc: DocumentHandle) => (await doc.pages.list()).pages[0]!.ref;

    /** A text field written in `fontFamily`, filled with `value`: its font goes into the document. */
    async function fieldIn(doc: DocumentHandle, fontFamily: string, value: string, name: string) {
      const page = await firstPage(doc);
      const { field } = await doc.forms.create({
        family: 'text',
        name,
        widgets: [{ page, rect: { x: 40, y: 40, width: 200, height: 24 }, fontFamily }],
      });
      await doc.forms.setValue(field.ref, { value });
      return field;
    }

    test('lists the 14 standard fonts, then the engine’s with its fallbacks, and the last resort apart', async () => {
      const doc = await open(fixtures.page);
      const list = await doc.fonts.list();
      expect(list.fonts.slice(0, 14).map((font) => font.source)).toEqual(
        Array(14).fill('standard'),
      );
      const helvetica = fontNamed(list.fonts, 'helvetica')!;
      expect(helvetica).toMatchObject({
        canChoose: true,
        restrictions: [],
        familyName: 'Helvetica',
      });
      expect(helvetica.programs[0]!.displayHash).toMatch(HEX_SHA256);

      const served = fontNamed(list.fonts, servedFont.key)!;
      expect(served).toMatchObject({ source: 'engine', canChoose: true, restrictions: [] });
      expect(served.programs[0]).toMatchObject({
        displayHash: servedFont.sha256,
        sourceHash: servedFont.sha256,
        format: 'truetype',
        canDownload: true,
      });
      // The engine's own fallbacks first, each one of its fonts.
      expect(list.fallbacks[0]).toBe(servedFont.key);
      for (const key of list.fallbacks) {
        expect(fontNamed(list.fonts, key)?.source).toBe('engine');
      }
      expect(list.lastResort).toMatchObject({ canDownload: true, embedded: 'none' });
      expect(list.lastResort.displayHash).toMatch(HEX_SHA256);
      await doc.close();
    });

    test('resolve says which program draws each run, and the characters no font has', async () => {
      const doc = await open(fixtures.page);
      const list = await doc.fonts.list();
      const answer = await doc.fonts.resolve({
        runs: [
          { text: 'Hi 中', fontFamily: 'helvetica' },
          { text: 'X', family: 'NoSuchFamily', weight: 700, italic: false },
        ],
      });
      expect(answer.runs[0]).toMatchObject({
        font: 'helvetica',
        program: fontNamed(list.fonts, 'helvetica')!.programs[0]!.displayHash,
        substituted: false,
      });
      expect(answer.runs[0]!.fallbacks[0]).toBe(servedFont.sha256);
      expect(answer.runs[1]).toMatchObject({ font: 'helvetica-bold', substituted: true });
      expect(answer.missingCharacters).toEqual(['中']);
      await doc.close();
    });

    test('a write that draws a character no font has says so, as resolve for its box does', async () => {
      const doc = await open(fixtures.page);
      const page = await firstPage(doc);
      const { meta } = await doc.page(page).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 20, width: 200, height: 40 },
        contents: 'Hello 中',
      });
      expect(meta.missingCharacters).toEqual(['中']);
      const plain = await doc.page(page).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 80, width: 200, height: 40 },
        contents: 'Hello',
      });
      expect(plain.meta.missingCharacters).toBe(undefined);

      const { field } = await doc.forms.create({
        family: 'text',
        name: 'missing',
        widgets: [
          { page, rect: { x: 40, y: 140, width: 200, height: 24 }, fontFamily: 'helvetica' },
        ],
      });
      const widget = (await doc.forms.list()).widgets.find(
        (candidate) =>
          candidate.ref.kind === 'objectNumber' &&
          candidate.ref.objectNumber === field.widgets[0]!.objectNumber,
      )!;
      const answer = await doc.fonts.resolve({
        annotation: widget.ref,
        runs: [{ text: 'A中B', fontFamily: 'helvetica' }],
      });
      expect(answer.missingCharacters).toEqual(['中']);
      const filled = await doc.forms.setValue(field.ref, { value: 'A中B' });
      expect(filled.meta.missingCharacters).toEqual(answer.missingCharacters);

      const label = await doc.page(page).annotations.create({
        subtype: 'redact',
        rect: { x: 40, y: 200, width: 200, height: 40 },
        overlayText: 'X中',
        fontFamily: 'helvetica',
      });
      expect(label.meta.missingCharacters).toEqual(['中']);
      // Applying stamps the label the mark drew: nothing is drawn again.
      const applied = await doc.redaction.apply({ annotations: [label.annotation.ref] });
      expect(applied.meta.missingCharacters).toBe(undefined);
      await doc.close();
    });

    test('a character no font has is drawn with the last resort, which the list keeps apart', async () => {
      const doc = await open(fixtures.page);
      await doc.page(await firstPage(doc)).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 20, width: 200, height: 40 },
        contents: 'Hello 中',
      });
      const saved = new TextDecoder('latin1').decode(await doc.download({ mode: 'rewrite' }));
      expect(saved).toContain('/EmbedPDFLastResort-Regular');
      const list = await doc.fonts.list();
      expect(list.fonts.some((font) => font.familyName === 'EmbedPDF Last Resort')).toBe(false);
      await doc.close();
    });

    test('a write that embeds a font ends its events with fonts.changed; one that doesn’t, doesn’t', async () => {
      const doc = await open(fixtures.page);
      const events: DocumentEvent[] = [];
      const unsubscribe = doc.events.subscribe((event) => events.push(event));
      await doc.fonts.list();
      const page = await firstPage(doc);
      const fontsChangedBy = (opId: string) =>
        events.filter(
          (event) =>
            event.type === 'fonts.changed' && 'tx' in event.origin && event.origin.tx?.id === opId,
        );

      const square = await doc.page(page).annotations.create({
        subtype: 'square',
        rect: { x: 10, y: 10, width: 20, height: 20 },
      });
      expect(fontsChangedBy(square.meta.opId)).toHaveLength(0);

      const text = await doc.page(page).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 60, width: 200, height: 40 },
        contents: 'Hello',
        fontFamily: servedFont.key,
      });
      // Published with the write's own events, before it settled.
      expect(fontsChangedBy(text.meta.opId)).toHaveLength(1);
      const list = await doc.fonts.list();
      expect(
        list.fonts.some((font) => font.source === 'document' && font.familyName === 'Roboto'),
      ).toBe(true);
      unsubscribe();
      await doc.close();
    });

    test('a document’s whole program is listed, named, downloaded and written with', async () => {
      const doc = await open(fixtures.page);
      // A field embeds its font whole.
      await fieldIn(doc, servedFont.key, 'hello', 'first');
      const list = await doc.fonts.list();
      const roboto = list.fonts.find(
        (font) => font.source === 'document' && font.familyName === 'Roboto',
      )!;
      expect(roboto).toMatchObject({ canChoose: true, restrictions: [], weight: 400 });
      expect(roboto.name).toBe(roboto.postScriptName);
      const program = roboto.programs[0]!;
      expect(program).toMatchObject({ embedded: 'whole', format: 'truetype', canDownload: true });
      expect(program.displayHash).toBe(servedFont.sha256);

      expect(await sha256(await doc.fonts.downloadProgram(program.displayHash!))).toBe(
        program.displayHash,
      );
      const info = await doc.fonts.getProgram(program.displayHash!);
      expect(covers(info.covers, 'A')).toBe(true);
      expect(info.ascent > 500 && info.descent < 0).toBe(true);

      // Written with by its name; read back by a name the list has for the
      // same program (the engine's own font while the engine has it).
      const field = await fieldIn(doc, roboto.name, 'Ωmega', 'second');
      const form = await doc.forms.list();
      const widgetNumber = form.fields.find((candidate) => candidate.name === field.name)!
        .widgets[0]!.objectNumber;
      const widget = form.widgets.find(
        (candidate) =>
          candidate.ref.kind === 'objectNumber' && candidate.ref.objectNumber === widgetNumber,
      )!;
      const readBack = fontNamed(list.fonts, widget.fontFamily!);
      expect(readBack?.programs[0]?.displayHash).toBe(program.displayHash);
      await doc.close();
    });

    test('one program two dictionaries read differently is two display programs, each served by its hash', async () => {
      const doc = await open(fixtures.sharedProgram);
      const font = (await doc.fonts.list()).fonts.find(
        (candidate) => candidate.source === 'document' && candidate.name === 'FoxitFixed',
      )!;
      expect(font.programs).toHaveLength(2);
      expect(new Set(font.programs.map((program) => program.sourceHash)).size).toBe(1);
      const hashes = font.programs.map((program) => program.displayHash!);
      expect(new Set(hashes).size).toBe(2);
      for (const hash of hashes) {
        expect(await sha256(await doc.fonts.downloadProgram(hash))).toBe(hash);
        const info = await doc.fonts.getProgram(hash);
        expect(covers(info.covers, 'A')).toBe(true);
      }
      await doc.close();
    });

    test('a field in a program two dictionaries read differently resolves to the one its own reads', async () => {
      const doc = await open(fixtures.sharedProgram);
      // In /Annots order: the field in the 600-wide dictionary, then the 900-wide one.
      const { widgets } = await doc.forms.list();
      const programs: (string | null)[] = [];
      for (const [index, width] of [600, 900].entries()) {
        const widget = widgets[index]!;
        expect(widget.fontFamily).toBe('FoxitFixed');
        const answer = await doc.fonts.resolve({
          annotation: widget.ref!,
          runs: [{ text: 'HELLO', fontFamily: widget.fontFamily! }],
        });
        const run = answer.runs[0]!;
        expect(run).toMatchObject({ font: 'FoxitFixed', substituted: false });
        // Its glyphs advance by its own dictionary's width, never the other's.
        const advances = advancesOf(await doc.fonts.downloadProgram(run.program!));
        expect([600, 900].filter((advance) => advances.has(advance))).toEqual([width]);
        programs.push(run.program);
      }
      expect(new Set(programs).size).toBe(2);
      await doc.close();
    });

    test('downloads the built-in programs and the served font, and refuses a hash it doesn’t name', async () => {
      const doc = await open(fixtures.page);
      const list = await doc.fonts.list();
      const helvetica = fontNamed(list.fonts, 'helvetica')!.programs[0]!.displayHash!;
      expect(await sha256(await doc.fonts.downloadProgram(helvetica))).toBe(helvetica);
      const lastResort = list.lastResort.displayHash!;
      expect(await sha256(await doc.fonts.downloadProgram(lastResort))).toBe(lastResort);
      expect(await sha256(await doc.fonts.downloadProgram(servedFont.sha256))).toBe(
        servedFont.sha256,
      );
      expect((await rejection(doc.fonts.downloadProgram('0'.repeat(64)))).code).toBe(
        EngineErrorCode.NotFound,
      );
      const info = await doc.fonts.getProgram(helvetica);
      expect(covers(info.covers, 'A')).toBe(true);
      await doc.close();
    });

    test('a program’s bytes go only to a token that may write text', async () => {
      const doc = await options.openReadOnly(engine!, fixtures.page.slice());
      const list = await doc.fonts.list();
      const helvetica = fontNamed(list.fonts, 'helvetica')!.programs[0]!.displayHash!;
      const refused = await rejection(doc.fonts.downloadProgram(helvetica));
      expect(refused.code).toBe(EngineErrorCode.Forbidden);
      expect((refused.details as { anyOf?: string[] }).anyOf).toContain('doc.annotate.modify');
      await doc.close();
    });

    test('a form font a browser can’t load goes to it as a display program of what the engine writes', async () => {
      const doc = await open(fixtures.keptFonts);
      const list = await doc.fonts.list();
      for (const [name, format] of [
        ['FoxitFixed', 'cff'],
        ['Roboto2-Regular', 'type1'],
      ] as const) {
        const font = fontNamed(list.fonts, name)!;
        expect(font).toMatchObject({
          source: 'document',
          canChoose: false,
          restrictions: ['unsupported-format'],
        });
        const program = font.programs[0]!;
        expect(program).toMatchObject({ format, embedded: 'whole', canDownload: true });
        expect(program.displayHash === program.sourceHash).toBe(false);
        const bytes = await doc.fonts.downloadProgram(program.displayHash!);
        expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('OTTO');
        expect(await sha256(bytes)).toBe(program.displayHash);
      }

      // The Type 1 font holds the letters of "Hello world" (in capitals) and no
      // space: the browser gets exactly the characters the engine writes with it.
      const hello = fontNamed(list.fonts, 'Roboto2-Regular')!.programs[0]!;
      const info = await doc.fonts.getProgram(hello.displayHash!);
      expect(['H', 'E', 'L', 'O', 'W', 'R', 'D'].every((c) => covers(info.covers, c))).toBe(true);
      expect(covers(info.covers, ' ')).toBe(false);
      expect(covers(info.covers, 'A')).toBe(false);

      // A field keeps its font while it covers the text, drawn by that program.
      const widget = (await doc.forms.list()).widgets.find(
        (candidate) => candidate.fontFamily === 'Roboto2-Regular',
      )!;
      const answer = await doc.fonts.resolve({
        annotation: widget.ref,
        runs: [{ text: 'HELLO', fontFamily: widget.fontFamily! }],
      });
      expect(answer.runs[0]).toMatchObject({
        font: 'Roboto2-Regular',
        substituted: false,
        program: hello.displayHash,
      });
      await doc.close();
    });

    test('a name that is no font fails, and a document subset can’t be chosen', async () => {
      const doc = await open(fixtures.page);
      const unknown = await rejection(
        doc.page(await firstPage(doc)).annotations.create({
          subtype: 'free-text',
          box: { x: 20, y: 20, width: 200, height: 40 },
          contents: 'x',
          fontFamily: 'NoSuchFont',
        }),
      );
      expect(unknown.code).toBe(EngineErrorCode.InvalidArg);
      await doc.close();

      const subsetDoc = await open(fixtures.documentSubset);
      const subset = (await subsetDoc.fonts.list()).fonts.find(
        (font) => font.source === 'document' && font.programs[0]?.embedded === 'subset',
      )!;
      expect(subset).toMatchObject({ canChoose: false });
      expect(subset.restrictions).toContain('subset');
      const refused = await rejection(
        subsetDoc.page(await firstPage(subsetDoc)).annotations.create({
          subtype: 'free-text',
          box: { x: 20, y: 20, width: 200, height: 40 },
          contents: 'x',
          fontFamily: subset.name,
        }),
      );
      expect(refused.code).toBe(EngineErrorCode.InvalidArg);
      expect((refused.details as { restrictions?: string[] }).restrictions).toContain('subset');
      await subsetDoc.close();
    });

    describe('a document font is everything the PDF draws under one name', () => {
      const documentFonts = async (doc: DocumentHandle) =>
        (await doc.fonts.list()).fonts.filter((font) => font.source === 'document');
      const namesOf = (fonts: readonly Font[]) => fonts.map((font) => font.name);
      const expectUnique = (fonts: readonly Font[]) =>
        expect(new Set(namesOf(fonts)).size).toBe(fonts.length);

      test('copies of one font under one name are one font, however each editor described it', async () => {
        const doc = await open(
          pdfWithFontDictionaries(fixtures.fontProgram, [
            // Both editors describe it alike.
            { baseFont: 'Same-Regular', family: 'Same', weight: 400 },
            { baseFont: 'Same-Regular', family: 'Same', weight: 400 },
            // One writes /FontFamily (Arial); the other doesn't, and the name reads as Helvetica.
            { baseFont: 'ArialMT', family: 'Arial', weight: 400 },
            { baseFont: 'ArialMT' },
            // One writes /FontWeight 600; the other doesn't, and "Bold" in the name reads 700.
            { baseFont: 'Grotesk-SemiBold', family: 'Grotesk', weight: 600 },
            { baseFont: 'Grotesk-SemiBold' },
            // One writes /FontWeight 100; the other doesn't, and the name has no weight it reads.
            { baseFont: 'Grotesk-Thin', family: 'Grotesk', weight: 100 },
            { baseFont: 'Grotesk-Thin' },
          ]),
        );
        const fonts = await documentFonts(doc);
        expectUnique(fonts);
        expect(namesOf(fonts).sort()).toEqual([
          'ArialMT',
          'Grotesk-SemiBold',
          'Grotesk-Thin',
          'Same-Regular',
        ]);
        for (const font of fonts) {
          expect(font.programs).toHaveLength(2);
          expect(font).toMatchObject({ canChoose: true, restrictions: [] });
        }
        await doc.close();
      });

      /**
       * A free text box written in `fontFamily` on `doc`'s first page: what it
       * reads back as, its body's family and weight, the fonts its appearance
       * draws with, and what `resolve` says a write in that font draws with.
       */
      async function boxIn(doc: DocumentHandle, fontFamily: string) {
        const page = await firstPage(doc);
        const { meta } = await doc.page(page).annotations.create({
          subtype: 'free-text',
          box: { x: 20, y: 20, width: 200, height: 40 },
          contents: 'שלום',
          fontFamily,
        });
        const { annotations } = await doc.page(page).annotations.list();
        const box = annotations.find((candidate) => candidate.subtype === 'free-text');
        if (box?.subtype !== 'free-text') throw new Error('no free text box');
        const drawn = await drawnTextOf(await doc.download());
        const resolved = await doc.fonts.resolve({
          annotation: box.ref,
          runs: [{ text: 'שלום', fontFamily }],
        });
        return {
          fontFamily: box.fontFamily,
          body: box.richText?.body,
          drawnIn: [...new Set(drawn.flatMap((form) => form.runs.map((run) => run.font)))],
          resolvedTo: resolved.runs[0]!.font,
          missingCharacters: meta.missingCharacters,
        };
      }

      test('a box written in a document font is drawn in it, its family and weight its own', async () => {
        const doc = await open(
          pdfWithFontDictionaries(fixtures.fontProgram, [
            { baseFont: 'BrandSans-SemiBold', family: 'Brand Sans', weight: 600 },
          ]),
        );
        const box = await boxIn(doc, 'BrandSans-SemiBold');
        expect(box.fontFamily).toBe('BrandSans-SemiBold');
        // The style a PDF keeps names the family, not the name the list gives the font.
        expect(box.body).toMatchObject({ family: 'Brand Sans', weight: 600, italic: false });
        expect(box.drawnIn).toEqual(['BrandSans-SemiBold']);
        expect(box.resolvedTo).toBe('BrandSans-SemiBold');
        expect(box.missingCharacters).toBe(undefined);
        await doc.close();
      });

      test('two fonts described alike keep their own names, and a box in one is drawn in that one', async () => {
        // Neither writes /FontWeight, and "Thin" isn't a weight the name is read for: one face.
        const doc = await open(
          pdfWithFontDictionaries(fixtures.fontProgram, [
            { baseFont: 'Mono-Regular' },
            { baseFont: 'Mono-Thin' },
          ]),
        );
        expect(namesOf(await documentFonts(doc))).toEqual(['Mono-Regular', 'Mono-Thin']);

        const box = await boxIn(doc, 'Mono-Thin');
        expect(box.fontFamily).toBe('Mono-Thin');
        expect(box.body).toMatchObject({ family: 'Mono', weight: 400 });
        expect(box.drawnIn).toEqual(['Mono-Thin']);
        expect(box.resolvedTo).toBe('Mono-Thin');
        const after = await documentFonts(doc);
        expectUnique(after);
        expect(namesOf(after).sort()).toEqual(['Mono-Regular', 'Mono-Thin']);
        await doc.close();
      });

      test('a font without a PostScript name is named by its family and exact style', async () => {
        const doc = await open(
          pdfWithFontDictionaries(fixtures.fontProgram, [
            { family: 'Inter', weight: 400 },
            { family: 'Inter', weight: 500 },
            { family: 'Inter', weight: 800 },
            { family: 'Inter', weight: 400, italic: true },
          ]),
        );
        const fonts = await documentFonts(doc);
        expect(namesOf(fonts)).toEqual([
          'Inter',
          'Inter,Medium',
          'Inter,ExtraBold',
          'Inter,Italic',
        ]);
        expect(fonts.every((font) => !font.canChoose)).toBe(true);
        await doc.close();
      });
    });
  });
}
