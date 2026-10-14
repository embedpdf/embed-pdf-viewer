import { defineComponent, h, onMounted, ref } from 'vue';
import type { VNodeChild } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { commandsPlugin } from '../src/commands';
import type { ResolvedCommand } from '../src/commands';
import { Toolbar, custom, group, item, useStripView } from '../src/toolbar';
import type { BarSchema, StripView } from '../src/toolbar';
import {
  CounterToken,
  bytesInput,
  counterPlugin,
  probe,
  settle,
  viewerWith,
} from './counter-plugin';

/**
 * `<Toolbar>`: the slots draw the parts, the fit decides which show, what
 * didn't fit goes into the "More" menu, and command state stays live. happy-dom
 * lays nothing out, so an element here is as wide as its text (10px a
 * character) and 20px tall, and the toolbar as wide as `room` and as tall as
 * `roomHeight`.
 */

enableAutoUnmount(afterEach);

let room = 1000;
let roomHeight = 1000;
beforeEach(() => {
  room = 1000;
  roomHeight = 1000;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const width = (this.textContent ?? '').trim().length * 10;
    return { width, height: 20, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 20 } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => room);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => roomHeight);
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
      { id: 'off', label: 'Off', run: () => {}, enabled: () => false },
      { id: 'page:go-to', label: 'Go to', run: () => {} },
    ],
  });

const bar: BarSchema = {
  id: 'main',
  sections: { start: [group('a', ['one', 'two'])], end: [group('b', ['three'])] },
};

/** The command slot used below: a button with the command's label, pressed when active. */
const commandSlot = ({ command, run }: { command: ResolvedCommand; run: () => void }) =>
  h(
    'button',
    { class: 'cmd', 'aria-pressed': String(command.active), onClick: run },
    command.label,
  );

async function mountToolbar(
  slots: Record<string, (props: never) => VNodeChild>,
  schema: BarSchema = bar,
  props: Record<string, unknown> = {},
): Promise<{ wrapper: VueWrapper; kernel: Awaited<ReturnType<typeof viewerWith>>['kernel'] }> {
  const { wrapper, kernel } = await viewerWith([counterPlugin, commands()], () =>
    h(Toolbar, { bar: schema, ...props }, slots),
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
    expect(live(wrapper, '.page-number').map((found) => found.text())).toEqual(['Page (default)']);
    expect(live(wrapper, 'button.cmd').map((button) => button.text())).toEqual(['One']);
  });

  it('measures a custom item that draws nothing in the measurement layer where it renders, by measure', async () => {
    room = 200;
    const schema: BarSchema = {
      id: 'main',
      sections: { center: [group('g', ['three', custom('wide', 'one')])] },
    };
    const Wide = defineComponent({
      props: { measure: { type: Function, required: true } },
      setup(props) {
        onMounted(() => props.measure(500));
        return () => h('span', { class: 'wide' }, 'Wide');
      },
    });
    const { wrapper } = await mountToolbar(
      {
        command: commandSlot,
        custom: ({ layer, measure }: { layer: string; measure: (length: number) => void }) =>
          layer === 'measure' ? null : h(Wide, { measure }),
      },
      schema,
    );
    // The measurement layer holds nothing for it, not even its command: only `measure` says how
    // long it is.
    const layer = wrapper.find('[aria-hidden="true"]');
    expect(layer.text()).not.toContain('One');
    // 500px don't fit in 200: the item goes into "More", as its command.
    expect(wrapper.findAll('.wide')).toHaveLength(0);
    await live(wrapper, 'button[title="More"]')[0].trigger('click');
    expect(live(wrapper, '[role="menu"] button').map((button) => button.text())).toContain('One');
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

/** Press a key on what has focus, and let Vue draw what it changed. */
async function press(key: string): Promise<void> {
  (document.activeElement as HTMLElement).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
  await settle();
}

/** The live row's button with this text. */
const button = (wrapper: VueWrapper, label: string) =>
  live(wrapper, 'button').find((each) => each.text() === label)!.element as HTMLButtonElement;

describe('<Toolbar> keyboard and screen readers', () => {
  it('is a toolbar to a screen reader, with its orientation and name', async () => {
    const { wrapper } = await mountToolbar({}, bar, { 'aria-label': 'Main' });
    const toolbar = wrapper.find('[role="toolbar"]');
    expect(toolbar.attributes('aria-orientation')).toBe('horizontal');
    expect(toolbar.attributes('aria-label')).toBe('Main');
  });

  it('is one tab stop, with arrow keys, Home and End between its buttons, past a disabled one', async () => {
    const schema: BarSchema = {
      id: 'main',
      sections: { start: [group('a', ['one', 'off', 'two'])], end: [group('b', ['three'])] },
    };
    const { wrapper } = await mountToolbar({}, schema);
    const stops = ['One', 'Two', 'Three'].map((label) => button(wrapper, label));
    expect(stops.map((stop) => stop.tabIndex)).toEqual([0, -1, -1]);

    stops[0]!.focus();
    await press('ArrowRight');
    expect(document.activeElement).toBe(button(wrapper, 'Two'));
    await press('End');
    expect(document.activeElement).toBe(button(wrapper, 'Three'));
    await press('ArrowRight');
    expect(document.activeElement).toBe(button(wrapper, 'One'));
    await press('ArrowLeft');
    expect(document.activeElement).toBe(button(wrapper, 'Three'));
    expect(stops.map((stop) => stop.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('swaps Left and Right in right-to-left text', async () => {
    const { wrapper } = await mountToolbar({}, bar, { style: 'direction: rtl' });
    button(wrapper, 'One').focus();
    await press('ArrowLeft');
    expect(document.activeElement).toBe(button(wrapper, 'Two'));
    await press('ArrowRight');
    expect(document.activeElement).toBe(button(wrapper, 'One'));
  });

  it('makes the first focusable element of a custom item its stop, and leaves it its keys', async () => {
    const schema: BarSchema = {
      id: 'main',
      sections: { center: [group('page', [custom('page-number', 'page:go-to'), 'one'])] },
    };
    const { wrapper } = await mountToolbar(
      {
        custom: () =>
          h('span', [h('input', { 'aria-label': 'Page' }), h('button', { type: 'button' }, 'Go')]),
      },
      schema,
    );
    const input = live(wrapper, 'input')[0]!.element;
    button(wrapper, 'One').focus();
    await press('ArrowLeft');
    expect(document.activeElement).toBe(input);
    // The field keeps Left and Right for its caret.
    await press('ArrowRight');
    expect(document.activeElement).toBe(input);
    // The item's other controls are the item's own.
    expect(button(wrapper, 'Go').tabIndex).toBe(0);
  });

  it('opens "More" on its first row, moves with the arrows, and Escape gives focus back', async () => {
    room = 70;
    const { wrapper } = await mountToolbar({});
    const more = live(wrapper, 'button[title="More"]')[0]!.element as HTMLButtonElement;
    more.focus();
    more.click();
    await settle();
    const rows = live(wrapper, '[role="menu"] button').map((row) => row.element);
    expect(document.activeElement).toBe(rows[0]);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    await press('ArrowDown');
    expect(document.activeElement).toBe(rows[1]);

    await press('Escape');
    expect(live(wrapper, '[role="menu"]')).toHaveLength(0);
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps focus on the row it is on when the toolbar draws again', async () => {
    room = 70;
    const { wrapper, kernel } = await mountToolbar({});
    const more = live(wrapper, 'button[title="More"]')[0]!.element as HTMLButtonElement;
    more.click();
    await settle();
    await press('ArrowDown');
    const row = document.activeElement;

    kernel.capability(CounterToken, 'a').touch();
    await settle();
    expect(live(wrapper, '[role="menu"]')).toHaveLength(1);
    expect(document.activeElement).toBe(row);
  });

  it('gives focus back to "More" when a row is picked', async () => {
    room = 70;
    const { wrapper } = await mountToolbar({});
    const more = live(wrapper, 'button[title="More"]')[0]!.element as HTMLButtonElement;
    more.click();
    await settle();
    await press('Enter');
    expect(live(wrapper, '[role="menu"]')).toHaveLength(0);
    expect(document.activeElement).toBe(more);
  });

  it('keeps the measured copies out of focus and away from screen readers', async () => {
    const { wrapper } = await mountToolbar({});
    const layer = wrapper.find('[aria-hidden="true"]').element;
    expect(layer.hasAttribute('inert')).toBe(true);
    expect(layer.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

describe('<Toolbar orientation="vertical">', () => {
  const rail: BarSchema = {
    id: 'rail',
    sections: {
      start: [group('a', [item('one', { variants: ['icon+label', 'icon'] }), 'two'])],
      end: [group('b', ['three'])],
    },
  };

  it('fits the height it has, whatever its width, and draws every command as its icon', async () => {
    // Too narrow for a single label across, but tall enough for every button.
    room = 10;
    const variants = new Set<string>();
    const { wrapper } = await mountToolbar(
      {
        command: (scope: { command: ResolvedCommand; variant: string; run: () => void }) => {
          variants.add(scope.variant);
          return commandSlot(scope);
        },
      },
      rail,
      { orientation: 'vertical' },
    );
    expect(wrapper.find('[role="toolbar"]').attributes('aria-orientation')).toBe('vertical');
    expect(live(wrapper, 'button.cmd').map((found) => found.text())).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    expect(live(wrapper, 'button[title="More"]')).toHaveLength(0);
    expect([...variants]).toEqual(['icon']);
  });

  it('makes room when its height runs out', async () => {
    // Three 20px buttons, two 8px gaps and a separator take 85px.
    roomHeight = 50;
    const { wrapper } = await mountToolbar({ command: commandSlot }, rail, {
      orientation: 'vertical',
    });
    expect(live(wrapper, 'button.cmd').length).toBeLessThan(3);
    expect(live(wrapper, 'button[title="More"]')).toHaveLength(1);
  });

  it('moves with Up and Down, and leaves Left and Right alone', async () => {
    const { wrapper } = await mountToolbar({}, rail, { orientation: 'vertical' });
    button(wrapper, 'One').focus();
    await press('ArrowRight');
    expect(document.activeElement).toBe(button(wrapper, 'One'));
    await press('ArrowDown');
    expect(document.activeElement).toBe(button(wrapper, 'Two'));
    await press('ArrowUp');
    expect(document.activeElement).toBe(button(wrapper, 'One'));
  });

  it('opens its "More" menu beside the toolbar', async () => {
    roomHeight = 50;
    const { wrapper } = await mountToolbar({}, rail, { orientation: 'vertical' });
    (live(wrapper, 'button[title="More"]')[0]!.element as HTMLButtonElement).click();
    await settle();
    const menu = live(wrapper, '[role="menu"]')[0]!.element as HTMLElement;
    expect(menu.style.insetInlineStart).toBe('100%');
    expect(menu.style.top).toBe('0px');
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
