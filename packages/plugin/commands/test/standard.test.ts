import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CommandDefinition, CommandFamily } from '@embedpdf/core';
import { createTestCommandContext } from '@embedpdf/core/testing';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';
import { describe, expect, it, vi } from 'vitest';

import { createStandardCommands } from '../src/standard';

const platform = () => ({
  copySelection: vi.fn(async () => 'text'),
  copyImage: vi.fn(async () => {}),
  saveFile: vi.fn(),
});

describe('createStandardCommands', () => {
  // Each list is tested where it lives (its plugin's `test/commands.test.ts`). This pins
  // the join: the commands 3.2 had, in the order their owners' lists come.
  it('joins the lists of the owners it had at 3.2, in order', () => {
    const items = createStandardCommands(platform());
    const ids = items.map((item) => ('id' in item ? item.id : `${item.prefix}*`));
    expect(ids).toEqual([
      'zoom:in',
      'zoom:out',
      'zoom:fit-width',
      'zoom:fit-page',
      'page:next',
      'page:previous',
      'page:first',
      'page:last',
      'view:rotate-clockwise',
      'view:rotate-counterclockwise',
      'tool:pointer',
      'tool:pan',
      'tool:zoom',
      'tool:*',
      'selection:copy',
      'annotation:delete',
      'tool:snapshot',
      'snapshot:copy',
      'snapshot:save',
      'snapshot:clear',
      'document:download',
      'document:print',
    ]);
    const defined = items.filter((item): item is CommandDefinition => 'id' in item);
    expect(defined.every((item) => item.labelKey?.startsWith('commands.') && item.label)).toBe(
      true,
    );
    expect(items.filter((item): item is CommandFamily => 'prefix' in item)).toHaveLength(1);
  });

  it('hands a list the part of the browser it needs', async () => {
    const browser = platform();
    const copy = createStandardCommands(browser).find(
      (item): item is CommandDefinition => 'id' in item && item.id === 'selection:copy',
    )!;
    const selection = { hasSelection: () => true, canCopy: () => true };
    await copy.run?.(createTestCommandContext([[SelectionToken, selection]]));
    expect(browser.copySelection).toHaveBeenCalledWith(selection);
  });
});

describe('the commands plugin', () => {
  // The plugin runs commands; it must not know which plugins there are. Their
  // commands come from their own `/commands` entries, and only the join above
  // (`standard.ts`) names them.
  it('imports no plugin but the shell and i18n, outside the standard join', () => {
    const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return files(full);
        return entry.name.endsWith('.ts') && entry.name !== 'standard.ts' ? [full] : [];
      });
    const plugins = new Set<string>();
    for (const file of files(src)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/from '@embedpdf\/plugin-([a-z0-9-]+)/g))
        plugins.add(match[1]!);
    }
    expect([...plugins].sort()).toEqual(['commands', 'i18n', 'shell']);
  });
});
