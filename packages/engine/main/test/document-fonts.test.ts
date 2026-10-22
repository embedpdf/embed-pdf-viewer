import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LAST_RESORT_HASH, standardFontProgram } from '@embedpdf/core-fonts';
import {
  runDocumentFontsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import type { DocumentEvent, Font } from '@embedpdf/engine-core/runtime';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { createLocalEngine, localEngine, type LocalEngine } from '../src/index';
import type { LocalDocumentHandle } from '../src/document/LocalDocumentHandle';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** An sfnt's tables as its directory names them: tag, offset, bytes. */
function tablesOf(font: Uint8Array): { tag: string; offset: number; bytes: Uint8Array }[] {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  return Array.from({ length: view.getUint16(4) }, (_, i) => {
    const record = 12 + i * 16;
    const offset = view.getUint32(record + 8);
    const bytes = font.slice(offset, offset + view.getUint32(record + 12));
    const tag = String.fromCharCode(...font.slice(record, record + 4));
    // checkSumAdjustment covers the whole font: it moves with the layout.
    if (tag === 'head') bytes.fill(0, 8, 12);
    return { tag, offset, bytes };
  });
}

/** `font` with every table one byte further on, as a font whose tables were written back to back is. */
function withTablesOffByOne(font: Uint8Array): Uint8Array {
  const count = new DataView(font.buffer, font.byteOffset).getUint16(4);
  const start = 12 + count * 16;
  const moved = new Uint8Array(font.length + 1);
  moved.set(font.subarray(0, start));
  moved.set(font.subarray(start), start + 1);
  const view = new DataView(moved.buffer);
  for (let i = 0; i < count; i++) {
    const offsetAt = 12 + i * 16 + 8;
    view.setUint32(offsetAt, view.getUint32(offsetAt) + 1);
  }
  return moved;
}

const fixture = async (name: string) =>
  new Uint8Array(await readFile(resolve(here, 'fixtures', name)));
const roboto = await fixture('Roboto-Regular.ttf');
const helloWorld = await fixture('hello_world.pdf');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let opened = 0;
runDocumentFontsConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  // The recipe's default fallbacks, and Roboto as the app's own fallback font.
  makeEngine: async () => {
    const engine = await localEngine({ runtime: { prefer: 'wasm' } });
    await engine.fonts.register({ key: 'roboto', data: roboto.slice() });
    await engine.fonts.addFallback('roboto');
    return engine;
  },
  open: (engine, bytes) =>
    engine.open({ kind: 'bytes', id: `fonts-${opened++}`, bytes }, { scope: ['*'] }),
  openReadOnly: (engine, bytes) =>
    engine.open(
      { kind: 'bytes', id: `fonts-${opened++}`, bytes },
      { scope: ['doc.open', 'doc.render'] },
    ),
  servedFont: { key: 'roboto', sha256: sha256(roboto) },
  fixtures: {
    page: helloWorld,
    keptFonts: await fixture('kept_fonts_form.pdf'),
    documentSubset: await fixture('freetext_document_subset_helvetica.pdf'),
  },
});

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

  test('says fonts.changed on every open document when the engine’s fonts change', async () => {
    const events: DocumentEvent[] = [];
    doc.events.on('fonts.changed', (event) => events.push(event));
    await engine.fonts.register({ key: 'roboto', data: roboto.slice() });
    expect(events).toHaveLength(1);
    await engine.fonts.addFallback('roboto');
    expect(events).toHaveLength(2);
  });

  test('a box in a document font the engine no longer has reads back by that font’s name', async () => {
    await engine.fonts.register({ key: 'roboto', data: roboto.slice() });
    await fieldIn('roboto', 'hello');
    // The font is the document's alone now.
    await engine.fonts.clear();

    const robotoFont = (await doc.fonts.list()).fonts.find(
      (font) => font.source === 'document' && font.familyName === 'Roboto',
    )!;
    const field = await fieldIn(robotoFont.name, 'Ωmega', 'second');
    const form = await doc.forms.list();
    const widgetNumber = form.fields.find((candidate) => candidate.name === field.name)!.widgets[0]!
      .objectNumber;
    const widget = form.widgets.find(
      (candidate) =>
        candidate.ref.kind === 'objectNumber' && candidate.ref.objectNumber === widgetNumber,
    )!;
    expect(widget.fontFamily).toBe(robotoFont.name);
  });

  test('a program whose tables a browser would refuse is downloaded realigned', async () => {
    const misaligned = withTablesOffByOne(roboto);
    expect(tablesOf(misaligned).every((table) => table.offset % 4 === 0)).toBe(false);
    await engine.fonts.register({ key: 'roboto', data: misaligned.slice() });
    await fieldIn('roboto', 'hello');
    await engine.fonts.clear();

    const list = await doc.fonts.list();
    const font = list.fonts.find(
      (candidate) => candidate.source === 'document' && candidate.familyName === 'Roboto',
    )!;
    expect(font).toMatchObject({ canChoose: true, restrictions: [] });
    const program = font.programs[0]!;
    expect(program).toMatchObject({ sourceHash: sha256(misaligned), canDownload: true });
    expect(program.displayHash).not.toBe(program.sourceHash);

    const bytes = await doc.fonts.downloadProgram(program.displayHash!);
    expect(sha256(bytes)).toBe(program.displayHash);
    const tables = tablesOf(bytes);
    expect(tables.every((table) => table.offset % 4 === 0)).toBe(true);
    const byTag = (list: ReturnType<typeof tablesOf>) =>
      Object.fromEntries(list.map((table) => [table.tag, [...table.bytes]]));
    expect(byTag(tables)).toEqual(byTag(tablesOf(misaligned)));
    const info = await doc.fonts.getProgram(program.displayHash!);
    expect(info.covers.some((range) => range.start <= 65 && 65 < range.start + range.count)).toBe(
      true,
    );
  });
});
