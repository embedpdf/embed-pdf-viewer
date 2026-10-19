/**
 * The page commands on a real engine: they act on the selected pages, an insert goes after the
 * selection and selects what came in, extract saves the copy under the document's name, and each
 * edit is a step of the history. Changing pages goes with the `pages` feature and
 * `doc.pages.assemble`; extract goes with `documents.download` and `doc.download`, so `readOnly`
 * keeps it. And the page menu, which each thumbnail opens, holds them.
 */
import { createKernel, toPageRef, type Engine, type Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF, OUTLINE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import { commandsPlugin } from '@embedpdf/plugin-commands';
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { pageEditPlugin, PageEditToken } from '@embedpdf/plugin-page-edit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => [] as { bytes: Uint8Array; name: string; type?: string }[]);
vi.mock('@embedpdf/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@embedpdf/web')>()),
  saveFile: (bytes: Uint8Array, name: string, type?: string) => saved.push({ bytes, name, type }),
}));

import { DEFAULT_LAYOUT } from '../../../chrome/src/config/chrome';
import { defaultCommands } from '../../../chrome/src/config/commands';
import { PAGE_MENU, pageCommands } from '../../../chrome/src/config/page-commands';
import { disabledSettingsOf } from '../../../chrome/src/features';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

// The fixture's two pages: 3 holds annotations and a field, 4 is empty.
const FIRST = toPageRef(3);
const SECOND = toPageRef(4);

async function viewerWith(
  options: { disable?: string[]; readOnly?: boolean; scope?: readonly string[] } = {},
) {
  const { disabledCategories, disabledCommands } = disabledSettingsOf(
    options.disable,
    options.readOnly,
  );
  const kernel = createKernel({
    engine,
    plugins: [
      pageEditPlugin(),
      historyPlugin(),
      commandsPlugin({ commands: pageCommands, disabledCategories, disabledCommands }),
    ],
  });
  await kernel.documents.open(
    { kind: 'bytes', id: `pages-${Math.random()}`, bytes: CHANGE_FIXTURE_PDF.slice() },
    { name: 'Report.pdf', ...(options.scope ? { scope: options.scope } : {}) } as never,
  );
  return {
    kernel,
    commands: kernel.capability(CommandsToken),
    pageEdit: kernel.capability(PageEditToken),
    history: kernel.capability(HistoryToken),
  };
}

const orderOf = (kernel: Kernel) =>
  kernel.documents.listPages().map((page) => page.ref.objectNumber);

const pdf = (name: string, bytes: Uint8Array) =>
  new File([bytes as BlobPart], name, { type: 'application/pdf' });

describe('the page commands', () => {
  it('act on the selected pages, each a step of the history', async () => {
    const { kernel, commands, pageEdit, history } = await viewerWith();
    expect(commands.resolveCommand('page:rotate-clockwise')?.enabled).toBe(false);
    pageEdit.select([SECOND]);
    await commands.execute('page:rotate-clockwise');
    expect(kernel.documents.listPages().map((page) => page.rotation)).toEqual([0, 90]);
    await commands.execute('page:rotate-counterclockwise');
    await commands.execute('page:rotate-counterclockwise');
    expect(kernel.documents.listPages().map((page) => page.rotation)).toEqual([0, 270]);
    expect(history.getUndoLabel()).toEqual({ key: 'pages.rotate', count: 1 });
    await kernel.destroy();
  });

  it('delete only while a page would stay, and the page leaves the selection', async () => {
    const { kernel, commands, pageEdit } = await viewerWith();
    pageEdit.select([FIRST, SECOND]);
    expect(commands.resolveCommand('page:delete')?.enabled).toBe(false);
    pageEdit.select([FIRST]);
    expect(commands.resolveCommand('page:delete')?.enabled).toBe(true);
    await commands.execute('page:delete');
    expect(orderOf(kernel)).toEqual([4]);
    expect(pageEdit.getSelected()).toEqual([]);
    await kernel.destroy();
  });

  it('insert a blank page after the selected page that comes last, and select it', async () => {
    const { kernel, commands, pageEdit } = await viewerWith();
    // Selected in the other order: the page further down is what the new one follows.
    pageEdit.select([SECOND, FIRST]);
    await commands.execute('page:insert-blank');
    const [blank] = pageEdit.getSelected();
    expect(orderOf(kernel)).toEqual([3, 4, blank!.objectNumber]);
    // With nothing selected it goes at the end, or where the caller says.
    pageEdit.select([]);
    await commands.execute('page:insert-blank', { args: { position: 'start' } });
    expect(orderOf(kernel)[0]).toBe(pageEdit.getSelected()[0]!.objectNumber);
    await kernel.destroy();
  });

  it('insert the PDFs given, one after another after the selection, and select every page', async () => {
    const { kernel, commands, pageEdit } = await viewerWith();
    pageEdit.select([FIRST]);
    const files = [
      pdf('a.pdf', CHANGE_FIXTURE_PDF),
      new File(['not a pdf'], 'notes.txt', { type: 'text/plain' }),
      pdf('b.pdf', OUTLINE_FIXTURE_PDF),
    ];
    await commands.execute('page:insert-file', { args: { files } });
    const inserted = pageEdit.getSelected().map((ref) => ref.objectNumber);
    const outline = await engine.open({ kind: 'bytes', bytes: OUTLINE_FIXTURE_PDF.slice() });
    const { pageCount } = await outline.pages.list();
    await outline.close();
    expect(inserted).toHaveLength(2 + pageCount);
    expect(orderOf(kernel)).toEqual([3, ...inserted, 4]);
    await kernel.destroy();
  });

  it('duplicate the selection right after it, selecting the copies', async () => {
    const { kernel, commands, pageEdit, history } = await viewerWith();
    pageEdit.select([FIRST]);
    await commands.execute('page:duplicate');
    const [copy] = pageEdit.getSelected();
    expect(orderOf(kernel)).toEqual([3, copy!.objectNumber, 4]);
    expect(history.getUndoLabel()).toEqual({ key: 'pages.duplicate', count: 1 });
    await kernel.destroy();
  });

  it('extract the selection as a PDF named after the document', async () => {
    const { kernel, commands, pageEdit } = await viewerWith();
    saved.length = 0;
    pageEdit.select([SECOND]);
    await commands.execute('page:extract');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Report-pages.pdf', type: 'application/pdf' });
    expect(new TextDecoder().decode(saved[0]!.bytes.slice(0, 5))).toBe('%PDF-');
    expect(orderOf(kernel)).toEqual([3, 4]);
    await kernel.destroy();
  });

  it('select all pages, until every page is', async () => {
    const { kernel, commands, pageEdit } = await viewerWith();
    await commands.execute('page:select-all');
    expect(pageEdit.getSelected()).toEqual([FIRST, SECOND]);
    expect(commands.resolveCommand('page:select-all')?.enabled).toBe(false);
    await kernel.destroy();
  });
});

describe('turning page editing off', () => {
  const editing = pageCommands.map((command) => command.id).filter((id) => id !== 'page:extract');

  it("disable: ['pages'] hides every page command but extract", async () => {
    const { kernel, commands } = await viewerWith({ disable: ['pages'] });
    expect(editing.filter((id) => commands.resolveCommand(id)?.visible)).toEqual([]);
    expect(commands.resolveCommand('page:extract')?.visible).toBe(true);
    await kernel.destroy();
  });

  it('readOnly keeps extract, which copies pages out without changing the document', async () => {
    const { kernel, commands } = await viewerWith({ readOnly: true });
    expect(editing.filter((id) => commands.resolveCommand(id)?.visible)).toEqual([]);
    expect(commands.resolveCommand('page:extract')?.visible).toBe(true);
    await kernel.destroy();
  });

  it('a scope without doc.pages.assemble hides the edits; without doc.download, extract too', async () => {
    const reading = await viewerWith({ scope: ['doc.open', 'doc.render', 'doc.download'] });
    const allowed = pageCommands
      .map((command) => command.id)
      .filter((id) => reading.commands.resolveCommand(id)?.visible);
    // Selecting changes nothing, so it stays.
    expect(allowed).toEqual(['page:extract', 'page:select-all']);
    await reading.kernel.destroy();

    const viewing = await viewerWith({ scope: ['doc.open', 'doc.render'] });
    expect(viewing.commands.resolveCommand('page:extract')?.visible).toBe(false);
    await viewing.kernel.destroy();
  });
});

describe('the page menu', () => {
  it('holds the page commands, for the thumbnails panel', () => {
    const ids = new Set(defaultCommands.map((command) => command.id));
    const menu = DEFAULT_LAYOUT.menus![PAGE_MENU]!.flatMap((section) =>
      Array.isArray(section) ? section : section.items,
    ) as string[];
    expect(menu.filter((id) => !ids.has(id))).toEqual([]);
    expect(menu).toEqual([
      'page:rotate-clockwise',
      'page:rotate-counterclockwise',
      'page:insert-blank',
      'page:insert-file',
      'page:duplicate',
      'page:extract',
      'page:delete',
    ]);
    // Pages are organized in the thumbnails panel: there is no mode of their own.
    expect(ids.has('mode:pages')).toBe(false);
    expect(DEFAULT_LAYOUT.bars!.pages).toBeUndefined();
  });
});
