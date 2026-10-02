import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { ShellToken, shellPlugin, useShellEvent, useShellState } from '../../src/shell';
import type { SurfaceHandle } from '../../src/shell';
import { bytesInput } from '../fixtures/counter-plugin';
import SurfaceProbe from '../fixtures/SurfaceProbe.svelte';
import Toggled from '../fixtures/Toggled.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `useSurface(id)`: one surface, closed and inert without a document, read live, with the verbs
 * for the document in scope. `useShellState()`: what is open. `useShellEvent()`: ends with the
 * component.
 */

async function surfaceProbe(id: string) {
  const seen: unknown[] = [];
  const handle: { current?: SurfaceHandle } = {};
  const viewer = await viewerWith([shellPlugin()], SurfaceProbe, { id, seen, handle });
  return { ...viewer, seen, surface: handle.current! };
}

describe('useSurface', () => {
  it('reads as closed with no document, and its verbs do nothing', async () => {
    const { surface, seen } = await surfaceProbe('comments');

    expect(latest(seen)).toEqual({ isOpen: false, props: {} });
    expect(() => surface.toggle({ exclusive: 'right' })).not.toThrow();
    flushSync();
    expect(surface.isOpen).toBe(false);
  });

  it('opens, closes and carries props, with verbs that work as plain handlers', async () => {
    const { kernel, surface, seen } = await surfaceProbe('comments');
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const { toggle, close } = surface;

    toggle({ exclusive: 'right', props: { focus: 'reply-1' } });
    flushSync();
    expect(latest(seen)).toEqual({ isOpen: true, props: { focus: 'reply-1' } });

    kernel.capability(ShellToken, 'a').updateSurfaceProps('comments', { focus: 'reply-2' });
    flushSync();
    expect(surface.props).toEqual({ focus: 'reply-2' });

    close();
    flushSync();
    expect(latest(seen)).toMatchObject({ isOpen: false });
  });

  it('follows an id given as a function', async () => {
    const { kernel, view, seen, surface } = await surfaceProbe('search');
    await kernel.documents.open(bytesInput('a'));
    kernel.capability(ShellToken, 'a').open('notes');
    flushSync();
    expect(surface.isOpen).toBe(false);

    await view.rerender({ contentProps: { id: 'notes', seen, handle: {} } });
    flushSync();
    expect(latest(seen)).toMatchObject({ isOpen: true });
    surface.close();
    flushSync();
    expect(kernel.capability(ShellToken, 'a').isOpen('notes')).toBe(false);
  });
});

describe('useShellState and useShellEvent', () => {
  it('read what is open, and hear openings until the component goes away', async () => {
    const opened = vi.fn();
    const menus = {
      read: () => {
        useShellEvent((shell) => shell.onSurfaceOpened, opened);
        return useShellState();
      },
      pick: (shell: unknown) => (shell as { readonly openMenus: readonly string[] }).openMenus,
      seen: [] as unknown[],
    };
    const control: { hide?: () => void } = {};
    const { kernel } = await viewerWith([shellPlugin()], Toggled, { probes: [menus], control });
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const shell = kernel.capability(ShellToken, 'a');

    shell.openMenu('view');
    shell.open('tips');
    flushSync();
    expect(latest(menus.seen)).toEqual(['view']);
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: 'tips' }));

    control.hide!();
    flushSync();
    shell.open('notes');
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
