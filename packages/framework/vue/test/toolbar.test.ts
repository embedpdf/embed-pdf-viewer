import { h, ref } from 'vue';
import type { VNodeChild } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { commandsPlugin } from '../src/commands';
import type { ResolvedCommand } from '../src/commands';
import { Toolbar, custom, group, useStripView } from '../src/toolbar';
import type { BarSchema, StripView } from '../src/toolbar';
import { CounterToken, bytesInput, counterPlugin, probe, settle, viewerWith } from './counter-plugin';

/**
 * `<Toolbar>`: the slots draw the parts, the fit decides which show, what
 * didn't fit goes into the "More" menu, and command state stays live. happy-dom
 * lays nothing out, so an element here is as wide as its text (10px a
 * character) and the toolbar as wide as `room`.
 */

enableAutoUnmount(afterEach);

let room = 1000;
beforeEach(() => {
  room = 1000;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const width = (this.textContent ?? '').trim().length * 10;
    return { width, height: 20, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 20 } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => room);
});
afterEach(() => vi.restoreAllMocks());

const run = { one: vi.fn(), two: vi.fn(), three: vi.fn() };
let pressed = false;
const commands = () =>
  commandsPlugin({
    commands: [
      { id: 'one', label: 'One', run: run.one },
      { id: 'two', label: 'Two', run: run.two, active: () => pressed },
      { id: 'three', label: 'Three', run: run.three },
      { id: 'page:go-to', label: 'Go to', run: () => {} },
    ],
  });

const bar: BarSchema = {
  id: 'main',
  sections: { start: [group('a', ['one', 'two'])], end: [group('b', ['three'])] },
};

/** The command slot used below: a button with the command's label, pressed when active. */
const commandSlot = ({ command, run }: { command: ResolvedCommand; run: () => void }) =>
  h('button', { class: 'cmd', 'aria-pressed': String(command.active), onClick: run }, command.label);

async function mountToolbar(
  slots: Record<string, (props: never) => VNodeChild>,
  schema: BarSchema = bar,
): Promise<{ wrapper: VueWrapper; kernel: Awaited<ReturnType<typeof viewerWith>>['kernel'] }> {
  const { wrapper, kernel } = await viewerWith([counterPlugin, commands()], () =>
    h(Toolbar, { bar: schema }, slots),
  );
  await kernel.documents.open(bytesInput('a'));
  await settle();
  await settle();
  return { wrapper, kernel };
}

/** What the live row shows: the elements outside the hidden measurement layer. */
const live = (wrapper: VueWrapper, selector: string) =>
  wrapper.findAll(selector).filter((found) => !found.element.closest('[aria-hidden="true"]'));

describe('<Toolbar>', () => {
  it('draws every command through #command when there is room', async () => {
    const { wrapper } = await mountToolbar({ command: commandSlot });
    expect(live(wrapper, 'button.cmd').map((button) => button.text())).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    expect(live(wrapper, 'button[title="More"]')).toHaveLength(0);

    await live(wrapper, 'button.cmd')[0].trigger('click');
    expect(run.one).toHaveBeenCalled();
  });

  it('moves what does not fit into the "More" menu, whose rows run and close it', async () => {
    room = 70;
    const { wrapper } = await mountToolbar({ command: commandSlot });
    const shown = live(wrapper, 'button.cmd').map((button) => button.text());
    expect(shown.length).toBeLessThan(3);

    const more = live(wrapper, 'button[title="More"]');
    expect(more).toHaveLength(1);
    await more[0].trigger('click');
    const rows = live(wrapper, '[role="menu"] button');
    const hidden = rows.map((row) => row.text());
    expect([...shown, ...hidden].sort()).toEqual(['One', 'Three', 'Two']);

    await rows[0].trigger('click');
    expect(live(wrapper, '[role="menu"]')).toHaveLength(0);
  });

  it('closes the "More" menu on a press outside it, not on one inside it or on its button', async () => {
    room = 70;
    const { wrapper } = await mountToolbar({ command: commandSlot });
    const more = live(wrapper, 'button[title="More"]')[0];
    await more.trigger('click');
    await live(wrapper, '[role="menu"] button')[0].trigger('pointerdown');
    await more.trigger('pointerdown');
    expect(live(wrapper, '[role="menu"]')).toHaveLength(1);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
    expect(live(wrapper, '[role="menu"]')).toHaveLength(0);
  });

  it('keeps command state live', async () => {
    pressed = false;
    const { wrapper, kernel } = await mountToolbar({ command: commandSlot });
    const two = () => live(wrapper, 'button.cmd').find((button) => button.text() === 'Two')!;
    expect(two().attributes('aria-pressed')).toBe('false');

    pressed = true;
    kernel.capability(CounterToken, 'a').touch();
    await settle();
    expect(two().attributes('aria-pressed')).toBe('true');
    pressed = false;
  });

  it('draws custom items through #custom, and their command where it draws nothing', async () => {
    const schema: BarSchema = {
      id: 'main',
      sections: {
        center: [group('page', [custom('page-number', 'page:go-to'), custom('other', 'one')])],
      },
    };
    const { wrapper } = await mountToolbar(
      {
        command: commandSlot,
        custom: ({ name, variant }: { name: string; variant: string }) =>
          name === 'page-number' ? h('span', { class: 'page-number' }, `Page (${variant})`) : null,
      },
      schema,
    );
    expect(live(wrapper, '.page-number').map((found) => found.text())).toEqual([
      'Page (default)',
    ]);
    expect(live(wrapper, 'button.cmd').map((button) => button.text())).toEqual(['One']);
  });

  it('without #custom, a custom item is a native slot holding its command, measured live', async () => {
    const schema: BarSchema = {
      id: 'main',
      sections: { center: [group('page', [custom('page-number', 'page:go-to')])] },
    };
    const { wrapper } = await mountToolbar({ command: commandSlot }, schema);
    const sockets = wrapper.findAll('slot[name="page-number"]');
    expect(sockets).toHaveLength(1);
    expect(sockets[0].element.closest('[aria-hidden="true"]')).toBeNull();
    expect(sockets[0].text()).toBe('Go to');
  });

  it('hands the "More" button and menu to their slots', async () => {
    room = 70;
    const { wrapper } = await mountToolbar({
      command: commandSlot,
      'overflow-trigger': ({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) =>
        h('button', { class: 'more', 'data-open': String(isOpen), onClick: toggle }, '+'),
      'overflow-menu': ({ view }: { view: { isOpen: boolean; sections: readonly unknown[] } }) =>
        view.isOpen ? h('ul', { class: 'menu' }, `${view.sections.length} sections`) : null,
    });
    const more = live(wrapper, 'button.more');
    expect(more).toHaveLength(1);
    expect(more[0].attributes('data-open')).toBe('false');

    await more[0].trigger('click');
    expect(live(wrapper, 'button.more')[0].attributes('data-open')).toBe('true');
    expect(live(wrapper, 'ul.menu')[0].text()).toMatch(/sections$/);
  });

  it('follows a new bar', async () => {
    const schema = ref<BarSchema>(bar);
    const { wrapper, kernel } = await viewerWith([counterPlugin, commands()], () =>
      h(Toolbar, { bar: schema.value }, { command: commandSlot }),
    );
    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(live(wrapper, 'button.cmd')).toHaveLength(3);

    schema.value = { id: 'other', sections: { center: [group('only', ['three'])] } };
    await settle();
    await settle();
    expect(live(wrapper, 'button.cmd').map((button) => button.text())).toEqual(['Three']);
  });

  it('draws the default parts without slots', async () => {
    const { wrapper } = await mountToolbar({});
    expect(live(wrapper, 'button').map((button) => button.text())).toEqual(['One', 'Two', 'Three']);
  });
});

describe('useStripView', () => {
  it('is the visible commands of a bar, and null when none is', async () => {
    const strip = ref<BarSchema | undefined>(bar);
    let view: { value: StripView | null } | null = null;
    const Probe = probe(() => {
      view = useStripView(() => strip.value);
    });
    const { kernel } = await viewerWith([counterPlugin, commands()], () => h(Probe));
    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(view!.value?.groups.map((each) => each.commands.map((command) => command.id))).toEqual([
      ['one', 'two'],
      ['three'],
    ]);

    strip.value = undefined;
    await settle();
    expect(view!.value).toBeNull();
  });
});
