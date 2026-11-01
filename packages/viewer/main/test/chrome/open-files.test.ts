/**
 * `document:open`, the one command behind the document menu's Open row and a PDF dropped on the
 * viewer: there only while the engine opens files, so the cloud viewer (whose engine says
 * `canOpenFiles: false`) never offers it, and gone with `documents.open` turned off. Given files,
 * it opens each as a new tab named after the file.
 */
import { createKernel, type DocumentHandle, type Engine, type OpenInput } from '@embedpdf/core';
import { commandsPlugin } from '@embedpdf/plugin-commands';
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LAYOUT } from '../../../chrome/src/config/chrome';
import { isPdfFile, mayCarryPdf, openFileCommand } from '../../../chrome/src/config/open-files';

/** An engine that says whether it opens files, and opens what it's given at once. */
function engineThat(canOpenFiles: boolean) {
  const opened: OpenInput[] = [];
  let count = 0;
  const engine = {
    canOpenFiles,
    open: async (input: OpenInput) => {
      opened.push(input);
      count += 1;
      return {
        id: `doc-${count}`,
        events: { subscribe: () => () => {}, lastServerId: () => null },
        pages: { list: () => Promise.resolve({ pageCount: 0, labels: [], pages: [] }) },
        security: { allows: () => true },
        close: () => Promise.resolve(),
      } as unknown as DocumentHandle;
    },
    destroy: async () => {},
  } as unknown as Engine;
  return { engine, opened };
}

async function viewerWith(canOpenFiles: boolean, disabledCategories: string[] = []) {
  const { engine, opened } = engineThat(canOpenFiles);
  const kernel = createKernel({
    engine,
    plugins: [commandsPlugin({ commands: [openFileCommand], disabledCategories })],
  });
  await kernel.start();
  return { kernel, commands: kernel.capability(CommandsToken), opened };
}

const pdf = (name: string) =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  });

describe('document:open', () => {
  it('is there with an engine that opens files, on Ctrl/Cmd+O', async () => {
    const { kernel, commands } = await viewerWith(true);
    expect(commands.resolveCommand('document:open')).toMatchObject({
      visible: true,
      enabled: true,
      shortcuts: ['Mod+O'],
      categories: ['documents.open'],
    });
    expect(commands.canExecute('document:open')).toBe(true);
    await kernel.destroy();
  });

  it('is never there on the cloud engine, which opens only what your server holds', async () => {
    const { kernel, commands, opened } = await viewerWith(false);
    expect(commands.resolveCommand('document:open')?.visible).toBe(false);
    expect(commands.canExecute('document:open')).toBe(false);
    await expect(
      commands.execute('document:open', { args: { files: [pdf('a.pdf')] } }),
    ).resolves.toEqual({ status: 'rejected', reason: 'hidden' });
    expect(opened).toEqual([]);
    expect(kernel.documents.getCount()).toBe(0);
    await kernel.destroy();
  });

  it('is gone with documents.open turned off, and refuses the files it is given', async () => {
    const { kernel, commands, opened } = await viewerWith(true, ['documents.open']);
    expect(commands.resolveCommand('document:open')?.visible).toBe(false);
    await expect(
      commands.execute('document:open', { args: { files: [pdf('a.pdf')] } }),
    ).resolves.toEqual({ status: 'rejected', reason: 'hidden' });
    expect(opened).toEqual([]);
    await kernel.destroy();
  });

  it('opens each file it is given as a new tab, named after it, the first one shown', async () => {
    const { kernel, commands, opened } = await viewerWith(true);
    const opening = vi.fn();
    kernel.documents.onOpened(opening);
    await commands.execute('document:open', {
      args: { files: [pdf('Contract.pdf'), pdf('appendix.PDF')] },
    });
    expect(kernel.documents.list().map((document) => document.name)).toEqual([
      'Contract',
      'appendix',
    ]);
    await vi.waitFor(() => expect(opening).toHaveBeenCalledTimes(2));
    expect(opened.map((input) => input.kind)).toEqual(['bytes', 'bytes']);
    expect(kernel.documents.getActive()?.name).toBe('Contract');
    await kernel.destroy();
  });

  it('is the first row of the document menu', () => {
    expect(DEFAULT_LAYOUT.menus?.document?.[0]).toEqual([
      'document:open',
      'document:download',
      'document:print',
    ]);
  });
});

describe('what a drop may open', () => {
  const drag = (types: string[], items?: { kind: string; type: string }[]) =>
    ({ types, items }) as unknown as DataTransfer;

  it('is a drag of files with a PDF among them, or of files whose types the browser keeps', () => {
    expect(mayCarryPdf(drag(['Files'], [{ kind: 'file', type: 'application/pdf' }]))).toBe(true);
    expect(mayCarryPdf(drag(['Files'], [{ kind: 'file', type: '' }]))).toBe(true);
    expect(mayCarryPdf(drag(['Files'], []))).toBe(true);
  });

  it('is never text, a link, or files that are all something else', () => {
    expect(mayCarryPdf(drag(['text/plain', 'text/html']))).toBe(false);
    expect(mayCarryPdf(drag(['Files'], [{ kind: 'file', type: 'image/png' }]))).toBe(false);
    expect(mayCarryPdf(null)).toBe(false);
  });

  it('opens PDFs: by their type, or by their name where the system gives no type', () => {
    expect(isPdfFile(pdf('contract'))).toBe(true);
    expect(isPdfFile(new File([], 'scan.PDF'))).toBe(true);
    expect(isPdfFile(new File([], 'notes.txt', { type: 'text/plain' }))).toBe(false);
  });
});
