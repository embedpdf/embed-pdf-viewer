import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EngineErrorCode, type FreeTextAnnotationDTO } from '@embedpdf/engine-core/runtime';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import { createLocalEngine, type LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const annotationsPdfPath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);
const robotoPath = resolve(here, 'fixtures', 'Roboto-Regular.ttf');

const PAGE = 3;
const RECT = { left: 50, bottom: 250, right: 350, top: 320 };

let annotationsPdf: Uint8Array;
let roboto: Uint8Array;

beforeAll(async () => {
  annotationsPdf = new Uint8Array(await readFile(annotationsPdfPath));
  roboto = new Uint8Array(await readFile(robotoPath));
});

async function rejection(p: PromiseLike<unknown>): Promise<{ code?: string }> {
  try {
    await p;
    throw new Error('expected promise to reject, but it resolved');
  } catch (err) {
    return err as { code?: string };
  }
}

const latin1 = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('');

async function readBack(doc: Awaited<ReturnType<LocalEngine['open']>>, id: string) {
  const snapshot = await doc.page(PAGE).annotations.list();
  const dto = snapshot.annotations.find((a) => a.subtype === 'free-text' && a.id === id);
  if (!dto) throw new Error(`free-text ${id} not found`);
  return dto as FreeTextAnnotationDTO;
}

describe('rich text FreeText (local engine)', () => {
  let engine: LocalEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  test('every FreeText reads back with richText; a plain one says so', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-plain', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica-bold',
      fontSize: 18,
      textAlign: 'left',
      contents: 'Plain\rtext',
      rect: RECT,
    });
    const dto = created.created as FreeTextAnnotationDTO;
    expect(dto.richTextSource).toBe('contents');
    expect(dto.fontFamily).toBe('helvetica-bold');
    expect(dto.richText.body.family).toBe('Helvetica');
    expect(dto.richText.body.weight).toBe(700);
    expect(dto.richText.body.size).toBe(18);
    expect(dto.richText.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))).toEqual([
      'Plain',
      'text',
    ]);
    await doc.close();
  });

  test('a draft with richText writes RC/DS/DA/Contents and reads back the runs', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-draft', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 12,
      textAlign: 'left',
      rect: RECT,
      color: { r: 0, g: 0, b: 255 },
      richText: {
        body: { family: 'Helvetica', size: 18, color: '#102030' },
        paragraphs: [
          {
            runs: [
              { text: 'Hello ' },
              { text: 'bold', style: { weight: 700 } },
              { text: ' red', style: { color: '#FF0000' } },
            ],
          },
          { align: 'center', runs: [{ text: 'H' }, { text: '2', style: { script: 'sub' } }] },
        ],
      },
    });
    const dto = created.created as FreeTextAnnotationDTO;
    expect(dto.richTextSource).toBe('rc');
    expect(dto.contents).toBe('Hello bold red\rH2');
    // The body became the /DA font and size; the /DA colour stayed the draft's.
    expect(dto.fontFamily).toBe('helvetica');
    expect(dto.fontSize).toBe(18);
    expect(dto.color).toEqual({ r: 0, g: 0, b: 255 });
    expect(dto.richText.body.color).toBe('#102030');
    expect(dto.richText.paragraphs[0]!.runs).toEqual([
      { text: 'Hello ' },
      { text: 'bold', style: { weight: 700 } },
      { text: ' red', style: { color: '#FF0000' } },
    ]);
    expect(dto.richText.paragraphs[1]!.align).toBe('center');
    expect(dto.richText.paragraphs[1]!.runs[1]).toEqual({ text: '2', style: { script: 'sub' } });

    const saved = latin1(await doc.download());
    expect(saved).toContain('xfa:APIVersion="EmbedPDF:1.0"');
    expect(saved).toContain('/HeBo');
    await doc.close();
  });

  test('alignment survives the plain → rich transition and follows textAlign', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-align', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 14,
      textAlign: 'center',
      contents: 'centred',
      rect: RECT,
    });
    const ref = created.created.ref;
    const plain = created.created as FreeTextAnnotationDTO;
    expect(plain.richTextSource).toBe('contents');
    expect(plain.textAlign).toBe('center');
    expect(plain.richText.body.align).toBe('center');
    // The first bold: paragraphs only, no body, no alignment (the editor's commit).
    const rich = (
      await doc.page(PAGE).annotations.update(ref, {
        subtype: 'free-text',
        richText: {
          paragraphs: [{ runs: [{ text: 'cen' }, { text: 'tred', style: { weight: 700 } }] }],
        },
      })
    ).updated as FreeTextAnnotationDTO;
    expect(rich.richTextSource).toBe('rc');
    expect(rich.textAlign).toBe('center');
    expect(rich.richText.body.align).toBe('center');
    expect(rich.richText.paragraphs[0]!.align).toBeUndefined();
    // Align on a rich box moves the body (and /Q), not only /Q.
    const right = (
      await doc.page(PAGE).annotations.update(ref, { subtype: 'free-text', textAlign: 'right' })
    ).updated as FreeTextAnnotationDTO;
    expect(right.textAlign).toBe('right');
    expect(right.richText.body.align).toBe('right');
    expect(right.richText.paragraphs[0]!.align).toBeUndefined();
    const saved = latin1(await doc.download());
    expect(saved).toContain('text-align:right');
    await doc.close();
  });

  test('patch table: contents-only rewrites a rich box as body-style paragraphs', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-contents', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 14,
      textAlign: 'left',
      rect: RECT,
      richText: {
        body: { family: 'Helvetica', size: 14 },
        paragraphs: [{ runs: [{ text: 'a' }, { text: 'b', style: { weight: 700 } }] }],
      },
    });
    const ref = created.created.ref;
    const updated = await doc.page(PAGE).annotations.update(ref, {
      subtype: 'free-text',
      contents: 'one\rtwo',
    });
    const dto = updated.updated as FreeTextAnnotationDTO;
    expect(dto.richTextSource).toBe('rc');
    expect(dto.contents).toBe('one\rtwo');
    // A paragraph names alignment/direction only where it differs from the body.
    expect(dto.richText.paragraphs).toEqual([
      { runs: [{ text: 'one' }] },
      { runs: [{ text: 'two' }] },
    ]);
    expect(dto.richText.body.size).toBe(14);
    await doc.close();
  });

  test('patch table: fontSize / fontColor move the body, runs keep their deltas', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-body', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 14,
      textAlign: 'left',
      rect: RECT,
      richText: {
        body: { family: 'Helvetica', size: 14 },
        paragraphs: [{ runs: [{ text: 'a' }, { text: 'b', style: { size: 30 } }] }],
      },
    });
    const ref = created.created.ref;
    const updated = await doc.page(PAGE).annotations.update(ref, {
      subtype: 'free-text',
      fontSize: 20,
      fontColor: { r: 255, g: 0, b: 0 },
      fontFamily: 'times-bold',
    });
    const dto = updated.updated as FreeTextAnnotationDTO;
    expect(dto.fontSize).toBe(20);
    expect(dto.fontFamily).toBe('times-bold');
    expect(dto.richText.body.color).toBe('#FF0000');
    expect(dto.richText.body.family).toBe('Times');
    expect(dto.richText.body.weight).toBe(700);
    expect(dto.richText.paragraphs[0]!.runs[1]).toEqual({ text: 'b', style: { size: 30 } });
    await doc.close();
  });

  test('patch table: contents and richText that disagree are rejected', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-agree', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 14,
      textAlign: 'left',
      contents: 'x',
      rect: RECT,
    });
    const ref = created.created.ref;
    const err = await rejection(
      doc.page(PAGE).annotations.update(ref, {
        subtype: 'free-text',
        contents: 'stale',
        richText: { paragraphs: [{ runs: [{ text: 'fresh' }] }] },
      }),
    );
    expect(err.code).toBe(EngineErrorCode.InvalidArg);
    // Agreeing is fine, and the text comes from the rich document.
    const updated = await doc.page(PAGE).annotations.update(ref, {
      subtype: 'free-text',
      contents: 'fresh',
      richText: { paragraphs: [{ runs: [{ text: 'fresh' }] }] },
    });
    expect((updated.updated as FreeTextAnnotationDTO).contents).toBe('fresh');
    expect((updated.updated as FreeTextAnnotationDTO).richTextSource).toBe('rc');
    await doc.close();
  });

  test('a registered font reads back as its key, in rich and plain boxes', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const handle = await engine.fonts.register({
      key: 'my-roboto',
      familyName: 'Roboto',
      data: roboto,
    });
    expect(handle.familyName).toBe('Roboto');
    expect(handle.weight).toBe(400);
    expect(handle.italic).toBe(false);
    expect(handle.embeddingPermission).toBe('installable');
    expect(handle.editingAuthorized).toBe(true);
    expect(handle.instanced).toBe(false);

    const doc = await engine.open({ kind: 'bytes', id: 'rt-key', bytes: annotationsPdf });
    const rich = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'my-roboto',
      fontSize: 16,
      textAlign: 'left',
      rect: RECT,
      richText: {
        body: { family: 'my-roboto', size: 16 },
        paragraphs: [{ runs: [{ text: 'Key ' }, { text: 'family', style: { family: 'Roboto' } }] }],
      },
    });
    const richDto = rich.created as FreeTextAnnotationDTO;
    expect(richDto.fontFamily).toBe('my-roboto');
    expect(richDto.richText.body.family).toBe('Roboto');

    const plain = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'my-roboto',
      fontSize: 16,
      textAlign: 'left',
      contents: 'Plain',
      rect: { left: 50, bottom: 150, right: 350, top: 220 },
    });
    expect((plain.created as FreeTextAnnotationDTO).fontFamily).toBe('my-roboto');
    await doc.close();
  });

  test('doc.fonts settings: FULL embeds the whole program, the rich engine takes plain boxes', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    await engine.fonts.register({ key: 'roboto', familyName: 'Roboto', data: roboto });
    const doc = await engine.open({ kind: 'bytes', id: 'rt-settings', bytes: annotationsPdf });
    expect(doc.fonts).toBeDefined();
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'roboto',
      fontSize: 18,
      textAlign: 'left',
      contents: 'Whole',
      rect: RECT,
    });
    // DEFAULT subsets: five glyphs of Roboto. FULL re-embeds the whole
    // program on the next regeneration (streams are compressed on save, so
    // the two saves are compared, not the raw font size).
    const subsetSave = await doc.download();
    await doc.fonts!.setEmbeddingPolicy('full');
    await doc.page(PAGE).annotations.update(created.created.ref, {
      subtype: 'free-text',
      contents: 'Whole program',
    });
    const fullSave = await doc.download();
    expect(fullSave.byteLength).toBeGreaterThan(subsetSave.byteLength * 3);

    await doc.fonts!.setFreeTextLayout('rich');
    await doc.fonts!.setTypographicFeatures(true);
    const richEngine = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 18,
      textAlign: 'left',
      contents: 'Rich engine',
      rect: { left: 50, bottom: 150, right: 350, top: 220 },
    });
    expect((richEngine.created as FreeTextAnnotationDTO).richTextSource).toBe('contents');
    await doc.close();
  });
});
