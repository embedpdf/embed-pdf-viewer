import { createTestCommandContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DocumentsToken, type CapabilityToken } from '@embedpdf/core';

import { createRenderCommands } from '../src/commands';
import { RenderToken } from '../src/contract';

function standard() {
  const platform = { copyImage: vi.fn(async () => {}), saveFile: vi.fn() };
  const items = createRenderCommands(platform);
  return { items, command: (id: string) => items.find((item) => item.id === id)!, platform };
}

describe('createRenderCommands', () => {
  it("has the snapshot tool and the snapshot's commands, with their shortcuts", () => {
    expect(standard().items.map((item) => [item.id, item.shortcut ?? null])).toEqual([
      ['tool:snapshot', null],
      ['snapshot:copy', 'Mod+C'],
      ['snapshot:save', null],
      ['snapshot:clear', 'Escape'],
    ]);
  });

  it('switches to the snapshot tool only when the user may take snapshots', () => {
    const { command } = standard();
    const render = { canSnapshot: () => false, getSnapshot: () => null };
    const context = createTestCommandContext(new Map([[RenderToken, render]]));
    expect(command('tool:snapshot').allowed?.(context)).toBe(false);
    expect(command('tool:snapshot').notAllowedKey).toBe('commands.notAllowed.doc-content-copy');
    render.canSnapshot = () => true;
    expect(command('tool:snapshot').allowed?.(context)).toBe(true);
    expect(command('tool:snapshot').labelKey).toBe('commands.tool.snapshot');
  });

  it('copies, saves and clears the snapshot, while there is one', async () => {
    const { command, platform } = standard();
    const blob = new Blob(['png'], { type: 'image/png' });
    const image = Promise.resolve({ blob: async () => blob });
    const snapshot = { page: { objectNumber: 22 }, rect: {}, image };
    const render = {
      getSnapshot: vi.fn((): typeof snapshot | null => null),
      clearSnapshot: vi.fn(),
    };
    const documents = {
      get: () => ({ name: 'Report.pdf' }),
      listPages: () => [{ ref: { objectNumber: 11 } }, { ref: { objectNumber: 22 } }],
    };
    const context = createTestCommandContext(
      new Map<CapabilityToken<unknown>, unknown>([
        [RenderToken, render],
        [DocumentsToken, documents],
      ]),
    );
    for (const id of ['snapshot:copy', 'snapshot:save', 'snapshot:clear']) {
      expect(command(id).enabled?.(context)).toBe(false);
    }
    render.getSnapshot.mockReturnValue(snapshot);
    for (const id of ['snapshot:copy', 'snapshot:save', 'snapshot:clear']) {
      expect(command(id).enabled?.(context)).toBe(true);
    }
    // The copy starts in the press: the picture goes to the clipboard as it comes.
    void command('snapshot:copy').run?.(context);
    expect(platform.copyImage).toHaveBeenCalledWith(image);
    await command('snapshot:save').run?.(context);
    expect(platform.saveFile).toHaveBeenCalledWith(blob, 'Report p2.png', 'image/png');
    await command('snapshot:clear').run?.(context);
    expect(render.clearSnapshot).toHaveBeenCalled();
  });
});
