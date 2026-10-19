import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LAST_RESORT_HASH, standardFontProgram } from '@embedpdf/core-fonts';
import { EngineErrorCode, type DocumentEvent, type Font } from '@embedpdf/engine-core/runtime';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { createLocalEngine, type LocalEngine } from '../src/index';
import type { LocalDocumentHandle } from '../src/document/LocalDocumentHandle';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

let roboto: Uint8Array;
let helloWorld: Uint8Array;

beforeAll(async () => {
  roboto = new Uint8Array(await readFile(resolve(here, 'fixtures', 'Roboto-Regular.ttf')));
  helloWorld = new Uint8Array(await readFile(resolve(here, 'fixtures', 'hello_world.pdf')));
});

async function rejection(
  promise: PromiseLike<unknown>,
): Promise<{ code?: string; details?: unknown }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string };
  }
  throw new Error('expected a rejection');
}

const fontNamed = (fonts: readonly Font[], name: string): Font | undefined =>
  fonts.find((font) => font.name === name);

describe('doc.fonts (local engine)', () => {
  let engine: LocalEngine;
  let doc: LocalDocumentHandle;

  beforeEach(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    doc = (await engine.open({ kind: 'bytes', id: 'fonts', bytes: helloWorld.slice() })) as never;
  });

  afterEach(async () => {
    await engine.destroy();
  });

  /** A text field written in `fontFamily`, filled with `value`: its font goes into the document. */
  async function fieldIn(fontFamily: string, value: string, name = 'name') {
    const page = (await doc.pages.list()).pages[0]!;
    const { field } = await doc.forms.create({
      family: 'text',
      name,
      widgets: [{ page: page.ref, rect: { x: 40, y: 40, width: 200, height: 24 }, fontFamily }],
    });
    await doc.forms.setValue(field.ref, { value });
    return field;
  }

  test('lists the 14 standard fonts first, then the engine’s, with the fallbacks and the last resort', async () => {
    const list = await doc.fonts.list();
    expect(list.fonts.slice(0, 14).map((font) => font.source)).toEqual(Array(14).fill('standard'));
    const helvetica = fontNamed(list.fonts, 'helvetica')!;
    expect(helvetica).toMatchObject({ canChoose: true, restrictions: [], familyName: 'Helvetica' });
    expect(helvetica.programs[0]!.displayHash).toBe(standardFontProgram('helvetica').hash);
    expect(list.fallbacks).toEqual([]);
    expect(list.lastResort.displayHash).toBe(LAST_RESORT_HASH);

    await engine.fonts.register({ key: 'roboto', data: roboto.slice() });
    await engine.fonts.addFallback('roboto');
    const after = await doc.fonts.list();
    const font = fontNamed(after.fonts, 'roboto')!;
    expect(font).toMatchObject({ source: 'engine', canChoose: true, restrictions: [] });
    expect(font.programs[0]).toMatchObject({
      displayHash: sha256(roboto),
      sourceHash: sha256(roboto),
      format: 'truetype',
      canDownload: true,
    });
    expect(after.fallbacks).toEqual(['roboto']);
  });

  test('says fonts.changed when the engine’s fonts change, and when a write adds one', async () => {
    const events: DocumentEvent[] = [];
    doc.events.on('fonts.changed', (event) => events.push(event));
    await engine.fonts.register({ key: 'roboto', data: roboto.slice() });
    expect(events).toHaveLength(1);

    // Once listed, a write that adds a font to the document says so; one
    // that doesn't, doesn't.
    await doc.fonts.list();
    const page = (await doc.pages.list()).pages[0]!;
    await doc.page(page.ref).annotations.create({
      subtype: 'square',
      rect: { x: 10, y: 10, width: 20, height: 20 },
    });
    await new Promise((settle) => setTimeout(settle, 50));
    expect(events).toHaveLength(1);
    await fieldIn('roboto', 'hello');
    await new Promise((settle) => setTimeout(settle, 50));
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  test('a document’s whole program is listed, named, downloaded and written with', async () => {
    await engine.fonts.register({ key: 'roboto', data: roboto.slice() });
    await fieldIn('roboto', 'hello');
    // The font is the document's alone now.
    await engine.fonts.clear();

    const list = await doc.fonts.list();
    const roboto400 = list.fonts.find(
      (font) => font.source === 'document' && font.familyName === 'Roboto',
    )!;
    expect(roboto400).toBeDefined();
    expect(roboto400).toMatchObject({ canChoose: true, restrictions: [], weight: 400 });
    expect(roboto400.name).toBe(roboto400.postScriptName);
    const program = roboto400.programs[0]!;
    expect(program).toMatchObject({ embedded: 'whole', format: 'truetype', canDownload: true });
    expect(program.displayHash).toBe(sha256(roboto));

    const bytes = await doc.fonts.downloadProgram(program.displayHash!);
    expect(sha256(bytes)).toBe(program.displayHash);
    const info = await doc.fonts.getProgram(program.displayHash!);
    expect(info.covers.some((range) => range.start <= 65 && 65 < range.start + range.count)).toBe(
      true,
    );
    expect(info.ascent).toBeGreaterThan(500);
    expect(info.descent).toBeLessThan(0);

    // Written with by its name, and read back by it.
    const field = await fieldIn(roboto400.name, 'Ωmega', 'second');
    const form = await doc.forms.list();
    const widgetNumber = form.fields.find((candidate) => candidate.name === field.name)!.widgets[0]!
      .objectNumber;
    const widget = form.widgets.find(
      (candidate) =>
        candidate.ref.kind === 'objectNumber' && candidate.ref.objectNumber === widgetNumber,
    )!;
    expect(widget.fontFamily).toBe(roboto400.name);
  });

  test('resolve says which program draws each run, the fallbacks and the missing characters', async () => {
    const answer = await doc.fonts.resolve({
      runs: [
        { text: 'Hi 中', fontFamily: 'helvetica' },
        { text: 'X', family: 'NoSuchFamily', weight: 700, italic: false },
      ],
    });
    expect(answer.runs[0]).toMatchObject({
      font: 'helvetica',
      program: standardFontProgram('helvetica').hash,
      substituted: false,
      fallbacks: [],
    });
    expect(answer.runs[1]).toMatchObject({ font: 'helvetica-bold', substituted: true });
    expect(answer.missingCharacters).toEqual(['中']);
  });

  test('a write that draws a character no font has says so in meta.missingCharacters', async () => {
    const page = (await doc.pages.list()).pages[0]!;
    const { meta } = await doc.page(page.ref).annotations.create({
      subtype: 'free-text',
      box: { x: 20, y: 20, width: 200, height: 40 },
      contents: 'Hello 中',
    });
    expect(meta.missingCharacters).toEqual(['中']);
    const plain = await doc.page(page.ref).annotations.create({
      subtype: 'free-text',
      box: { x: 20, y: 80, width: 200, height: 40 },
      contents: 'Hello',
    });
    expect(plain.meta.missingCharacters).toBeUndefined();
  });

  test('downloads the built-in programs, and refuses an unknown hash', async () => {
    const helvetica = await doc.fonts.downloadProgram(standardFontProgram('helvetica').hash);
    expect(sha256(helvetica)).toBe(standardFontProgram('helvetica').hash);
    const lastResort = await doc.fonts.downloadProgram(LAST_RESORT_HASH);
    expect(sha256(lastResort)).toBe(LAST_RESORT_HASH);
    expect((await rejection(doc.fonts.downloadProgram('0'.repeat(64)))).code).toBe(
      EngineErrorCode.NotFound,
    );
  });

  test('a name that is no font fails, and a document subset can’t be chosen', async () => {
    const page = (await doc.pages.list()).pages[0]!;
    const unknown = await rejection(
      doc.page(page.ref).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 20, width: 200, height: 40 },
        contents: 'x',
        fontFamily: 'NoSuchFont',
      }),
    );
    expect(unknown.code).toBe(EngineErrorCode.InvalidArg);

    const subsetPdf = new Uint8Array(
      await readFile(resolve(here, 'fixtures', 'freetext_document_subset_helvetica.pdf')),
    );
    const subsetDoc = await engine.open({ kind: 'bytes', id: 'subset', bytes: subsetPdf });
    const subset = (await subsetDoc.fonts.list()).fonts.find(
      (font) => font.source === 'document' && font.programs[0]?.embedded === 'subset',
    )!;
    expect(subset).toBeDefined();
    expect(subset).toMatchObject({ canChoose: false });
    expect(subset.restrictions).toContain('subset');
    const subsetPage = (await subsetDoc.pages.list()).pages[0]!;
    const refused = await rejection(
      subsetDoc.page(subsetPage.ref).annotations.create({
        subtype: 'free-text',
        box: { x: 20, y: 20, width: 200, height: 40 },
        contents: 'x',
        fontFamily: subset.name,
      }),
    );
    expect(refused.code).toBe(EngineErrorCode.InvalidArg);
    expect(refused.details).toMatchObject({ restrictions: expect.arrayContaining(['subset']) });
  });
});
