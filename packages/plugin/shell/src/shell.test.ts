import type { PluginContext } from '@embedpdf/core';
import { describe, expect, it } from 'vitest';

import { createShellController } from './controller';
import { initialShellState, shellReducer, type ShellAction, type ShellState } from './model';

function harness() {
  let state = initialShellState();
  const ctx = {
    getState: () => state,
    dispatch: (action: ShellAction) => {
      state = shellReducer(state, action);
    },
    cleanup: () => {},
  } as unknown as PluginContext<ShellState, ShellAction>;
  return createShellController(ctx);
}

describe('shell', () => {
  it('opens exclusively, reads surfaces with their id, and announces every flip', () => {
    const shell = harness();
    const log: string[] = [];
    shell.onSurfaceOpened((e) => log.push(`open:${e.id}`));
    shell.onSurfaceClosed((e) => log.push(`close:${e.id}`));
    shell.open('search', { exclusive: 'right', props: { q: 'a' } });
    shell.open('comments', { exclusive: 'right' });
    expect(shell.isOpen('search')).toBe(false);
    expect(shell.getSurface('search')).toMatchObject({
      id: 'search',
      open: false,
      props: { q: 'a' },
    });
    expect(shell.listOpenSurfaces().map((s) => s.id)).toEqual(['comments']);
    const list = shell.listOpenSurfaces();
    expect(shell.listOpenSurfaces()).toBe(list); // reference-stable
    shell.updateSurfaceProps('comments', { thread: 1 });
    expect(shell.getSurface('comments')?.props).toEqual({ thread: 1 });
    shell.closeAll();
    expect(shell.listOpenSurfaces()).toEqual([]);
    expect(log).toEqual(['open:search', 'close:search', 'open:comments', 'close:comments']);
  });

  it('keeps a menu stack and round-trips a snapshot', () => {
    const shell = harness();
    const log: string[] = [];
    shell.onMenuOpened((e) => log.push(`+${e.id}`));
    shell.onMenuClosed((e) => log.push(`-${e.id}`));
    shell.openMenu('file');
    shell.toggleMenu('edit');
    expect(shell.listOpenMenus()).toEqual(['file', 'edit']);
    shell.toggleMenu('file');
    shell.open('sidebar');
    const snapshot = shell.getSnapshot();
    shell.closeAllMenus();
    shell.closeAll();
    shell.applySnapshot(snapshot);
    expect(shell.listOpenMenus()).toEqual(['edit']);
    expect(shell.isOpen('sidebar')).toBe(true);
    expect(log).toEqual(['+file', '+edit', '-file', '-edit', '+edit']);
  });
});
