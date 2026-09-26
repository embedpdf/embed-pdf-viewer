import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import { createShellController } from '../src/controller';
import { initialShellState } from '../src/model';

const harness = () => {
  const ctx = createTestContext({ id: 'shell', state: initialShellState() });
  return ctx.connect(createShellController(ctx));
};

describe('shell', () => {
  it('opens exclusively, reads surfaces with their id, and announces every flip', () => {
    const shell = harness();
    const log: string[] = [];
    shell.onSurfaceOpened((event) => log.push(`open:${event.id}`));
    shell.onSurfaceClosed((event) => log.push(`close:${event.id}`));
    shell.open('search', { exclusive: 'right', props: { q: 'a' } });
    shell.open('comments', { exclusive: 'right' });
    expect(shell.isOpen('search')).toBe(false);
    expect(shell.getSurface('search')).toMatchObject({
      id: 'search',
      open: false,
      props: { q: 'a' },
    });
    expect(shell.listOpenSurfaces().map((surface) => surface.id)).toEqual(['comments']);
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
    shell.onMenuOpened((event) => log.push(`+${event.id}`));
    shell.onMenuClosed((event) => log.push(`-${event.id}`));
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
