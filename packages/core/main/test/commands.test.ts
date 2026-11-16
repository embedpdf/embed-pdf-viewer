import { describe, expect, it, vi } from 'vitest';

import { createDocumentCommands } from '../src/commands';
import { createTestCommandContext } from '../src/testing';
import { DocumentsToken } from '../src/types';

function standard() {
  const platform = { saveFile: vi.fn() };
  const items = createDocumentCommands(platform);
  return { items, command: (id: string) => items.find((item) => item.id === id)!, platform };
}

describe('createDocumentCommands', () => {
  it('has download and print, with their shortcuts', () => {
    expect(standard().items.map((item) => [item.id, item.shortcut])).toEqual([
      ['document:download', 'Mod+S'],
      ['document:print', 'Mod+P'],
    ]);
  });

  it('downloads the document as a file named after it', async () => {
    const { command, platform } = standard();
    const bytes = new Uint8Array([1, 2]);
    const documents = {
      download: vi.fn(async () => bytes),
      get: () => ({ name: 'contract' }),
      canDownload: () => true,
      canPrint: () => false,
    };
    const context = createTestCommandContext(new Map([[DocumentsToken, documents]]));
    // The documents' own checks say whether the session may: the commands plugin hides them
    // when they say no, with the permission's sentence.
    expect(command('document:download').requires).toBeUndefined();
    expect(command('document:download').allowed?.(context)).toBe(true);
    expect(command('document:print').allowed?.(context)).toBe(false);
    expect(command('document:download').notAllowedKey).toBe('commands.notAllowed.doc-download');
    expect(command('document:print').notAllowedKey).toBe('commands.notAllowed.doc-print');
    expect(command('document:download').enabled?.(context)).toBe(true);
    expect(command('document:print').enabled?.({ ...context, documentId: null })).toBe(false);
    await command('document:download').run?.(context);
    expect(documents.download).toHaveBeenCalledWith('doc', { signal: undefined });
    expect(platform.saveFile).toHaveBeenCalledWith(bytes, 'contract.pdf', 'application/pdf');
  });

  it('prints the document in scope through the kernel', async () => {
    const { command } = standard();
    const documents = { print: vi.fn(async () => {}), canPrint: () => true };
    const context = createTestCommandContext(new Map([[DocumentsToken, documents]]));
    expect(command('document:print').allowed?.(context)).toBe(true);
    await command('document:print').run?.(context);
    expect(documents.print).toHaveBeenCalledWith('doc', { signal: undefined });
  });
});
