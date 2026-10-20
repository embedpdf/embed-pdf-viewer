/**
 * The attachments on a real engine, with the history: read when asked, an
 * add shows at once under a free name and is one step of the history, an
 * undone remove draws the file back before the engine answers, a refused
 * add leaves at once, a page's file joins the list, and a session without
 * the rights reads but can't change or save.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createKernel, isPluginError, type Engine } from '@embedpdf/core';
import { gate } from '@embedpdf/core/testing';
import { createLocalEngine } from '@embedpdf/engine';
import { iconRect } from '@embedpdf/engine-core/conformance';
import { annotationPlugin, AnnotationToken } from '@embedpdf/plugin-annotation';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { attachmentPlugin } from '../src/attachment.plugin';
import {
  AttachmentToken,
  type AttachedFile,
  type AttachmentCapability,
  type AttachmentsChangedEvent,
} from '../src/contract';

const here = dirname(fileURLToPath(import.meta.url));
// PDFium's corpus file: two attachments, "1.txt" ("test", text/plain) and "attached.pdf".
const FIXTURE = resolve(here, '../../../engine/main/test/fixtures/embedded_attachments.pdf');

let engine: Engine;
let fixture: Uint8Array;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  fixture = new Uint8Array(await readFile(FIXTURE));
});
afterAll(async () => {
  await engine.destroy();
});

async function boot(options: { scope?: readonly string[]; annotations?: boolean } = {}) {
  const gated = gate(engine);
  const kernel = createKernel({
    engine: gated.engine,
    plugins: [
      attachmentPlugin(),
      historyPlugin(),
      ...(options.annotations ? [interactionPlugin(), annotationPlugin()] : []),
    ],
  });
  await kernel.documents.open(
    { kind: 'bytes', id: `attachments-${Math.random()}`, bytes: fixture.slice() },
    options.scope ? ({ scope: options.scope } as never) : undefined,
  );
  const attachment = kernel.capability(AttachmentToken);
  const history = kernel.capability(HistoryToken);
  await attachment.ensureLoaded();
  return { kernel, gated, attachment, history };
}

const namesOf = (attachment: AttachmentCapability) => attachment.list().map((file) => file.name);
const named = (attachment: AttachmentCapability, name: string): AttachedFile => {
  const file = attachment.list().find((candidate) => candidate.name === name);
  if (!file) throw new Error(`no file ${name}`);
  return file;
};
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('reading', () => {
  it('reads the attachments when asked, in the order the document keeps them', async () => {
    const gated = gate(engine);
    const kernel = createKernel({ engine: gated.engine, plugins: [attachmentPlugin()] });
    await kernel.documents.open({
      kind: 'bytes',
      id: `attachments-${Math.random()}`,
      bytes: fixture.slice(),
    });
    const attachment = kernel.capability(AttachmentToken);
    expect(attachment.getStatus()).toBe('idle');
    expect(attachment.list()).toEqual([]);
    await attachment.ensureLoaded();
    expect(attachment.getStatus()).toBe('ready');
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    const [first] = attachment.list();
    expect(first).toMatchObject({
      id: 'doc:1.txt',
      home: { kind: 'document', ref: { kind: 'key', key: '1.txt' } },
      size: 4,
    });
    expect(attachment.get('doc:1.txt')).toBe(first);
    await kernel.destroy();
  });
});

describe('adding and removing', () => {
  it('shows an add at once under a free name, pending, and answers with the engine’s file', async () => {
    const { kernel, gated, attachment, history } = await boot();
    gated.holding = true;
    const picked = new File([new TextEncoder().encode('again')], '1.txt', { type: 'text/plain' });
    const adding = attachment.add([{ data: picked }]);
    await vi.waitFor(() => expect(gated.held).toHaveLength(1));
    // "1 (2).txt" sorts before "1.txt": a space comes before a full stop.
    expect(namesOf(attachment)).toEqual(['1 (2).txt', '1.txt', 'attached.pdf']);
    const shown = named(attachment, '1 (2).txt');
    expect(shown).toMatchObject({ mimeType: 'text/plain', size: 5, checksum: null });
    expect(attachment.isPending(shown)).toBe(true);

    await gated.release();
    const [added] = await adding;
    expect(added).toMatchObject({ id: 'doc:1 (2).txt', name: '1 (2).txt', size: 5 });
    expect(added!.checksum).not.toBeNull();
    expect(attachment.isPending(added!)).toBe(false);
    expect(history.getUndoLabel()).toEqual({ key: 'attachment.add', count: 1 });
    expect(text((await attachment.download(added!)).bytes)).toBe('again');
    await kernel.destroy();
  });

  it('adds several files as one step of the history', async () => {
    const { kernel, attachment, history } = await boot();
    await attachment.add([
      { data: new Uint8Array([1]), name: 'b.bin' },
      { data: new Uint8Array([2]), name: 'b.bin', description: 'the second' },
    ]);
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf', 'b (2).bin', 'b.bin']);
    expect(named(attachment, 'b (2).bin').description).toBe('the second');
    await history.undo();
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    await kernel.destroy();
  });

  it('draws an undone remove back before the engine answers, with its bytes', async () => {
    const { kernel, gated, attachment, history } = await boot();
    await attachment.remove(named(attachment, '1.txt'));
    expect(namesOf(attachment)).toEqual(['attached.pdf']);
    expect(history.getUndoLabel()).toEqual({ key: 'attachment.remove' });

    gated.holding = true;
    history.undo();
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    await gated.release();
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    expect(text((await attachment.download(named(attachment, '1.txt'))).bytes)).toBe('test');

    history.redo();
    expect(namesOf(attachment)).toEqual(['attached.pdf']);
    await gated.release();
    expect(namesOf(attachment)).toEqual(['attached.pdf']);
    await kernel.destroy();
  });

  it('takes a refused add away at once', async () => {
    const { kernel, gated, attachment } = await boot();
    gated.holding = true;
    const adding = attachment.add([{ data: new Uint8Array([1]), name: 'new.bin' }]);
    await vi.waitFor(() => expect(gated.held).toHaveLength(1));
    expect(namesOf(attachment)).toContain('new.bin');
    gated.refuse(new Error('refused'));
    await expect(adding).rejects.toSatisfy((error: unknown) => isPluginError(error));
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    await kernel.destroy();
  });

  it('refuses bytes without a name before anything shows', async () => {
    const { kernel, attachment, history } = await boot();
    await expect(attachment.add([{ data: new Uint8Array([1]) }])).rejects.toSatisfy(
      (error: unknown) => isPluginError(error, 'invalid-input'),
    );
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    expect(history.canUndo()).toBe(false);
    await kernel.destroy();
  });

  it('saves a file under its name without the characters that disguise it', async () => {
    const { kernel, attachment } = await boot();
    const rlo = String.fromCharCode(0x202e);
    const [added] = await attachment.add([
      { data: new Uint8Array([7]), name: `invoice${rlo}fdp.exe`, mimeType: 'application/pdf' },
    ]);
    const content = await attachment.download(added!);
    expect(content).toEqual({
      bytes: new Uint8Array([7]),
      name: 'invoicefdp.exe',
      mimeType: 'application/pdf',
    });
    await kernel.destroy();
  });

  it('announces each confirmed change once, with its origin; a read announces a resync', async () => {
    const { kernel, attachment, history } = await boot();
    const changes: AttachmentsChangedEvent[] = [];
    let resyncs = 0;
    attachment.onChanged((event) => changes.push(event));
    attachment.onResynced(() => (resyncs += 1));
    await attachment.add([{ data: new Uint8Array([1]), name: 'a.bin' }]);
    await attachment.remove(named(attachment, '1.txt'));
    await history.undo();
    await attachment.refresh();
    expect(
      changes.map((event) => [event.type, event.files.map((file) => file.name), event.origin.kind]),
    ).toEqual([
      ['added', ['a.bin'], 'local'],
      ['removed', ['1.txt'], 'local'],
      ['restored', ['1.txt'], 'local'],
    ]);
    expect(resyncs).toBe(1);
    await kernel.destroy();
  });
});

describe("a page's files", () => {
  it('lists a file attachment annotation after the attachments, and saves, shows and removes it', async () => {
    const { kernel, attachment } = await boot({ annotations: true });
    const annotation = kernel.capability(AnnotationToken);
    await vi.waitFor(() => expect(annotation.getStatus()).toBe('ready'));
    const { annotation: created } = await annotation.create(
      0,
      { subtype: 'file-attachment', rect: iconRect(40, 60), file: { name: 'figures.csv' } },
      { file: new Uint8Array([1, 2, 3]) },
    );
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf', 'figures.csv']);
    const file = named(attachment, 'figures.csv');
    expect(file.home).toEqual({ kind: 'page', ref: created.ref });
    expect(attachment.canRemove(file)).toBe(true);
    expect((await attachment.download(file)).bytes).toEqual(new Uint8Array([1, 2, 3]));

    attachment.reveal(file);
    expect(annotation.selection.list().map((selected) => selected.ref)).toEqual([created.ref]);

    await attachment.remove(file);
    expect(annotation.get(created.ref)).toBeNull();
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    await kernel.destroy();
  });
});

describe('permissions', () => {
  it('reads without the rights, and refuses every change and save without changing anything', async () => {
    const { kernel, attachment, history } = await boot({ scope: ['doc.open'] });
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    expect(attachment.canAdd()).toBe(false);
    expect(attachment.canDownload()).toBe(false);
    const file = named(attachment, '1.txt');
    expect(attachment.canRemove(file)).toBe(false);
    const refused = (error: unknown) => isPluginError(error, 'permission-denied');
    await expect(attachment.add([{ data: new Uint8Array([1]), name: 'x.bin' }])).rejects.toSatisfy(
      refused,
    );
    await expect(attachment.remove(file)).rejects.toSatisfy(refused);
    await expect(attachment.download(file)).rejects.toSatisfy(refused);
    expect(namesOf(attachment)).toEqual(['1.txt', 'attached.pdf']);
    expect(history.canUndo()).toBe(false);
    await kernel.destroy();
  });
});
