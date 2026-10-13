import { h, ref } from 'vue';
import type { Ref, VNodeChild } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { DocumentScope } from '../src/runtime';
import {
  ShellToken,
  shellPlugin,
  useShellEvent,
  useShellState,
  useSurface,
  useSurfaceFocus,
} from '../src/shell';
import type { SurfaceHandle } from '../src/shell';
import { bytesInput, probe, settle, viewerWith } from './counter-plugin';

/**
 * `useSurface(id)`: one surface's state as refs, closed and inert without a
 * document, and the verbs for the document in scope. `useShellState()`: what
 * is open, as refs. `useShellEvent()`: ends with the component.
 * `useSurfaceFocus(id, element)`: the cursor moves in when the surface asks.
 */

enableAutoUnmount(afterEach);

describe('useSurface', () => {
  it('reads as closed with no document, and its verbs do nothing', async () => {
    let surface: SurfaceHandle | null = null;
    const Probe = probe(() => {
      surface = useSurface('comments');
    });
    await viewerWith([shellPlugin()], () => h(Probe));

    expect(surface!.isOpen.value).toBe(false);
    expect(surface!.props.value).toEqual({});
    expect(() => surface!.toggle({ exclusive: 'right' })).not.toThrow();
    expect(surface!.isOpen.value).toBe(false);
  });

  it('opens, closes and carries props, as refs that survive destructuring', async () => {
    let isOpen: Readonly<Ref<boolean>> | null = null;
    let props: Readonly<Ref<Readonly<Record<string, unknown>>>> | null = null;
    let toggle: SurfaceHandle['toggle'] | null = null;
    let close: SurfaceHandle['close'] | null = null;
    const Probe = probe(() => {
      ({ isOpen, props, toggle, close } = useSurface('comments'));
    });
    const { kernel } = await viewerWith([shellPlugin()], () => h(Probe));
    await kernel.documents.open(bytesInput('a'));
    await settle();

    toggle!({ exclusive: 'right', props: { focus: 'reply-1' } });
    await settle();
    expect(isOpen!.value).toBe(true);
    expect(props!.value).toEqual({ focus: 'reply-1' });

    kernel.capability(ShellToken, 'a').updateSurfaceProps('comments', { focus: 'reply-2' });
    await settle();
    expect(props!.value).toEqual({ focus: 'reply-2' });

    close!();
    await settle();
    expect(isOpen!.value).toBe(false);
  });

  it('follows an id given as a getter', async () => {
    const id = ref('search');
    let surface: SurfaceHandle | null = null;
    const Probe = probe(() => {
      surface = useSurface(() => id.value);
    });
    const { kernel } = await viewerWith([shellPlugin()], () => h(Probe));
    await kernel.documents.open(bytesInput('a'));
    kernel.capability(ShellToken, 'a').open('notes');
    await settle();
    expect(surface!.isOpen.value).toBe(false);

    id.value = 'notes';
    await settle();
    expect(surface!.isOpen.value).toBe(true);
    surface!.close();
    await settle();
    expect(kernel.capability(ShellToken, 'a').isOpen('notes')).toBe(false);
  });
});

describe('useShellState and useShellEvent', () => {
  it('read what is open, and hear openings until unmount', async () => {
    const opened = vi.fn();
    const menus: (readonly string[])[] = [];
    const Probe = probe(() => {
      const { openMenus } = useShellState();
      useShellEvent((shell) => shell.onSurfaceOpened, opened);
      return () => {
        menus.push(openMenus.value);
        return null;
      };
    });
    const shown = ref(true);
    const { kernel } = await viewerWith([shellPlugin()], () => (shown.value ? h(Probe) : null));
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const shell = kernel.capability(ShellToken, 'a');

    shell.openMenu('view');
    shell.open('tips');
    await settle();
    expect(menus[menus.length - 1]).toEqual(['view']);
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: 'tips' }));

    shown.value = false;
    await settle();
    shell.open('notes');
    expect(opened).toHaveBeenCalledTimes(1);
  });
});

/** An input that follows a surface's focus requests, with text in it. */
const field = (id = 'search', select?: boolean) =>
  probe(() => {
    const element = ref<HTMLInputElement | null>(null);
    useSurfaceFocus(id, element, { select });
    return () => h('input', { ref: element, 'data-field': id, value: 'contract' });
  });

/** The field only while its panel is open, as a panel draws its content. */
const panel = probe(() => {
  const { isOpen } = useSurface('search');
  return () => (isOpen.value ? h(field()) : null);
});

const input = (id = 'search') =>
  document.querySelector<HTMLInputElement>(`[data-field="${id}"]`) as HTMLInputElement;

describe('useSurfaceFocus', () => {
  async function opened(content: () => VNodeChild) {
    const viewer = await viewerWith([shellPlugin()], content);
    await viewer.kernel.documents.open(bytesInput('a'));
    await settle();
    return { ...viewer, shell: viewer.kernel.capability(ShellToken, 'a') };
  }

  it('focuses the element on every request, also with the surface open already', async () => {
    const { shell } = await opened(() => h(field()));
    shell.open('search', { focus: true });
    await settle();
    expect(document.activeElement).toBe(input());

    input().blur();
    shell.open('search', { focus: true });
    await settle();
    expect(document.activeElement).toBe(input());
  });

  it('never focuses on a plain open', async () => {
    const { shell } = await opened(() => h(panel));
    shell.open('search');
    await settle();
    expect(input()).toBeTruthy();
    expect(document.activeElement).not.toBe(input());
  });

  it('focuses an element that mounts because its surface opened asking for it', async () => {
    const { shell } = await opened(() => h(panel));
    shell.toggle('search', { focus: true });
    await settle();
    expect(document.activeElement).toBe(input());
  });

  it('selects the text with select, and only places the cursor without it', async () => {
    const Field = field('search');
    const Selecting = field('notes', true);
    const { shell } = await opened(() => [h(Field), h(Selecting)]);
    input().setSelectionRange(8, 8);
    shell.open('search', { focus: true });
    await settle();
    expect([input().selectionStart, input().selectionEnd]).toEqual([8, 8]);

    shell.open('notes', { focus: true });
    await settle();
    expect(document.activeElement).toBe(input('notes'));
    expect([input('notes').selectionStart, input('notes').selectionEnd]).toEqual([0, 8]);
  });

  it("reads its subtree's document: a request in one never moves the cursor in another", async () => {
    const viewer = await viewerWith([shellPlugin()], () => [
      h(DocumentScope, { id: 'a' }, () => h(field('notes'))),
      h(DocumentScope, { id: 'b' }, () => h(field('search'))),
    ]);
    await viewer.kernel.documents.open(bytesInput('a'));
    await viewer.kernel.documents.open(bytesInput('b'));
    await settle();
    viewer.kernel.capability(ShellToken, 'a').open('search', { focus: true });
    await settle();
    expect(document.activeElement).not.toBe(input('search'));
    viewer.kernel.capability(ShellToken, 'b').open('search', { focus: true });
    await settle();
    expect(document.activeElement).toBe(input('search'));
    viewer.kernel.capability(ShellToken, 'b').open('notes', { focus: true });
    await settle();
    expect(document.activeElement).toBe(input('search'));
  });
});
