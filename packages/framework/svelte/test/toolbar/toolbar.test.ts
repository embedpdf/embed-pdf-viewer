import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import { commandsPlugin } from '../../src/commands';
import { custom, group, item, useStripView, type BarSchema } from '../../src/toolbar';
import { CounterToken, bytesInput, counterPlugin } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import ToolbarHarness from '../fixtures/ToolbarHarness.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `useStripView(bar)`: the bar's visible commands, grouped, or null while none applies.
 * `<Toolbar>`: the live row draws what fits through the `command` and `custom` snippets (or the
 * defaults), the rest goes into the "More" menu, and a hidden measurement layer draws every unit
 * in every variant. happy-dom has no layout, so every measured width is 0 and the toolbar's width
 * is whatever the test gives `clientWidth`.
 */

afterEach(() => vi.restoreAllMocks());

const withWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);

const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('zoom', ['zoom:out', item('zoom:in', { variants: ['icon+label', 'icon'] })])],
    end: [group('pages', ['page:next', 'page:unknown'])],
  },
};

const commands = (run = vi.fn()) => [
  commandsPlugin({
    commands: [
      { id: 'zoom:out', label: 'Zoom out', run },
      { id: 'zoom:in', label: 'Zoom in', run },
      { id: 'page:next', label: 'Next page', run },
      { id: 'page:go-to', label: 'Go to page', run },
    ],
  }),
];

/** What a selector finds in the live row, and in the hidden measurement layer. */
const split = (root: HTMLElement, selector: string) => {
  const all = [...root.querySelectorAll<HTMLElement>(selector)];
  return {
    live: all.filter((element) => !element.closest('[aria-hidden="true"]')),
    measured: all.filter((element) => element.closest('[aria-hidden="true"]')),
  };
};

describe('Toolbar', () => {
  it('draws every command that fits through the command snippet, and runs it for the document', async () => {
    withWidth(1000);
    const run = vi.fn();
    const { kernel, view } = await viewerWith(commands(run), ToolbarHarness, {
      bar,
      drawCommands: true,
    });
    await kernel.documents.open(bytesInput('a'));
    flushSync();

    const buttons = split(view.container, '[data-command]');
    // An id no plugin registered takes no room.
    expect(buttons.live.map((button) => button.dataset.command)).toEqual([
      'zoom:out',
      'zoom:in',
      'page:next',
    ]);
    // The widest variant fits.
    expect(buttons.live[1]!.dataset.variant).toBe('icon+label');
    // Every unit in every variant is measured.
    expect(
      buttons.measured.map((button) => `${button.dataset.command}@${button.dataset.variant}`),
    ).toEqual(['zoom:out@icon', 'zoom:in@icon+label', 'zoom:in@icon', 'page:next@icon']);

    await fireEvent.click(buttons.live[2]!);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a' }));
  });

  it('puts what does not fit in the "More" menu, whose rows run and close it', async () => {
    withWidth(0);
    const run = vi.fn();
    const { view } = await viewerWith(commands(run), ToolbarHarness, { bar });
    flushSync();

    const more = split(view.container, 'button[title="More"]').live;
    expect(more).toHaveLength(1);
    expect(view.queryAllByRole('menuitem')).toHaveLength(0);

    await fireEvent.click(more[0]!);
    const rows = view.getAllByRole('menuitem');
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      'Zoom out',
      'Zoom in',
      'Next page',
    ]);

    await fireEvent.click(rows[2]!);
    expect(run).toHaveBeenCalledTimes(1);
    expect(view.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('closes the "More" menu on a press outside it, not on one inside it or on its button', async () => {
    withWidth(0);
    const { view } = await viewerWith(commands(), ToolbarHarness, { bar });
    flushSync();
    const more = split(view.container, 'button[title="More"]').live[0]!;
    await fireEvent.click(more);
    await fireEvent.pointerDown(view.getAllByRole('menuitem')[0]!);
    await fireEvent.pointerDown(more);
    expect(view.queryAllByRole('menu')).toHaveLength(1);

    await fireEvent.pointerDown(document.body);
    expect(view.queryAllByRole('menu')).toHaveLength(0);
  });

  it('draws custom items with the custom snippet, by name, in the row and the measurement layer', async () => {
    withWidth(1000);
    const customBar: BarSchema = {
      id: 'main',
      sections: {
        center: [
          group('pages', [custom('page-number', 'page:go-to', { variants: ['full', 'compact'] })]),
        ],
      },
    };
    const { view } = await viewerWith(commands(), ToolbarHarness, {
      bar: customBar,
      drawCustom: true,
    });
    flushSync();

    const items = split(view.container, '[data-custom="page-number"]');
    expect(items.live.map((element) => [element.dataset.variant, element.dataset.layer])).toEqual([
      ['full', 'live'],
    ]);
    expect(items.measured.map((element) => element.dataset.variant)).toEqual(['full', 'compact']);
  });

  it('without a custom snippet, a custom item is a native slot holding its command', async () => {
    withWidth(1000);
    const customBar: BarSchema = {
      id: 'main',
      sections: { center: [group('pages', [custom('page-number', 'page:go-to')])] },
    };
    const { view } = await viewerWith(commands(), ToolbarHarness, { bar: customBar });
    flushSync();

    const sockets = view.container.querySelectorAll('slot[name="page-number"]');
    // Measured where it renders, never in the measurement layer.
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.closest('[aria-hidden="true"]')).toBeNull();
    expect(sockets[0]!.textContent?.trim()).toBe('Go to page');
  });
});

/** Press a key on what has focus, and let Svelte draw what it changed. */
const press = (key: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key });

/** The live row's button with this text. */
const buttonOf = (root: HTMLElement, label: string) =>
  split(root, 'button').live.find((each) => each.textContent?.trim() === label)!;

/** Each element happy-dom lays out is 10px a character wide and 20px tall. */
const textBoxes = () =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const width = (this.textContent ?? '').trim().length * 10;
    return { width, height: 20, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 20 } as DOMRect;
  });

const withHeight = (height: number) =>
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);

const keysBar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('zoom', ['zoom:out', 'page:off', 'zoom:in'])],
    end: [group('pages', ['page:next'])],
  },
};

const keyCommands = () => [
  counterPlugin,
  commandsPlugin({
    commands: [
      { id: 'zoom:out', label: 'Zoom out', run: () => {} },
      { id: 'zoom:in', label: 'Zoom in', run: () => {} },
      { id: 'page:off', label: 'Off', run: () => {}, enabled: () => false },
      { id: 'page:next', label: 'Next page', run: () => {} },
      { id: 'page:go-to', label: 'Go to page', run: () => {} },
    ],
  }),
];

describe('Toolbar keyboard and screen readers', () => {
  it('is a toolbar to a screen reader, with its orientation and name', async () => {
    withWidth(1000);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, { bar, label: 'Main' });
    const toolbar = view.getByRole('toolbar');
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(toolbar.getAttribute('aria-label')).toBe('Main');
  });

  it('is one tab stop, with arrow keys, Home and End between its buttons, past a disabled one', async () => {
    withWidth(1000);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, { bar: keysBar });
    flushSync();
    const button = (label: string) => buttonOf(view.container, label);
    const stops = ['Zoom out', 'Zoom in', 'Next page'].map(button);
    expect(stops.map((stop) => stop.tabIndex)).toEqual([0, -1, -1]);

    stops[0]!.focus();
    await press('ArrowRight');
    expect(document.activeElement).toBe(button('Zoom in'));
    await press('End');
    expect(document.activeElement).toBe(button('Next page'));
    await press('ArrowRight');
    expect(document.activeElement).toBe(button('Zoom out'));
    await press('ArrowLeft');
    expect(document.activeElement).toBe(button('Next page'));
    expect(stops.map((stop) => stop.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('swaps Left and Right in right-to-left text', async () => {
    withWidth(1000);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, {
      bar: keysBar,
      style: 'direction: rtl',
    });
    flushSync();
    const button = (label: string) => buttonOf(view.container, label);
    button('Zoom out').focus();
    await press('ArrowLeft');
    expect(document.activeElement).toBe(button('Zoom in'));
    await press('ArrowRight');
    expect(document.activeElement).toBe(button('Zoom out'));
  });

  it('makes the first focusable element of a custom item its stop, and leaves it its keys', async () => {
    withWidth(1000);
    const customBar: BarSchema = {
      id: 'main',
      sections: { center: [group('page', [custom('page-number', 'page:go-to'), 'zoom:in'])] },
    };
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, {
      bar: customBar,
      drawCustom: 'field',
    });
    flushSync();
    const input = split(view.container, 'input').live[0]!;
    buttonOf(view.container, 'Zoom in').focus();
    await press('ArrowLeft');
    expect(document.activeElement).toBe(input);
    // The field keeps Left and Right for its caret.
    await press('ArrowRight');
    expect(document.activeElement).toBe(input);
    // The item's other controls are the item's own.
    expect(buttonOf(view.container, 'Go').tabIndex).toBe(0);
  });

  it('opens "More" on its first row, moves with the arrows, and Escape gives focus back', async () => {
    withWidth(0);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, { bar });
    flushSync();
    const more = split(view.container, 'button[title="More"]').live[0]!;
    more.focus();
    await fireEvent.click(more);
    const rows = view.getAllByRole('menuitem');
    expect(document.activeElement).toBe(rows[0]);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    await press('ArrowDown');
    expect(document.activeElement).toBe(rows[1]);

    await press('Escape');
    expect(view.queryAllByRole('menu')).toHaveLength(0);
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps focus on the row it is on when the toolbar draws again', async () => {
    withWidth(0);
    const { kernel, view } = await viewerWith(keyCommands(), ToolbarHarness, { bar });
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    await fireEvent.click(split(view.container, 'button[title="More"]').live[0]!);
    await press('ArrowDown');
    const row = document.activeElement;

    kernel.capability(CounterToken, 'a').touch();
    flushSync();
    expect(view.queryAllByRole('menu')).toHaveLength(1);
    expect(document.activeElement).toBe(row);
  });

  it('gives focus back to "More" when a row is picked', async () => {
    withWidth(0);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, { bar });
    flushSync();
    const more = split(view.container, 'button[title="More"]').live[0]!;
    await fireEvent.click(more);
    await press('Enter');
    expect(view.queryAllByRole('menu')).toHaveLength(0);
    expect(document.activeElement).toBe(more);
  });

  it('keeps the measured copies out of focus and away from screen readers', async () => {
    withWidth(1000);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, { bar });
    flushSync();
    const layer = view.container.querySelector('[aria-hidden="true"]')!;
    expect(layer.hasAttribute('inert')).toBe(true);
    expect(layer.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

describe('Toolbar orientation="vertical"', () => {
  const rail: BarSchema = {
    id: 'rail',
    sections: {
      start: [group('zoom', [item('zoom:out', { variants: ['icon+label', 'icon'] }), 'zoom:in'])],
      end: [group('pages', ['page:next'])],
    },
  };

  it('fits the height it has, whatever its width, and draws every command as its icon', async () => {
    textBoxes();
    // Too narrow for a single label across, but tall enough for every button.
    withWidth(10);
    withHeight(1000);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, {
      bar: rail,
      orientation: 'vertical',
      drawCommands: true,
    });
    flushSync();
    expect(view.getByRole('toolbar').getAttribute('aria-orientation')).toBe('vertical');
    const buttons = split(view.container, '[data-command]').live;
    expect(buttons.map((button) => button.dataset.command)).toEqual([
      'zoom:out',
      'zoom:in',
      'page:next',
    ]);
    expect(new Set(buttons.map((button) => button.dataset.variant))).toEqual(new Set(['icon']));
    expect(split(view.container, 'button[title="More"]').live).toHaveLength(0);
  });

  it('makes room when its height runs out', async () => {
    textBoxes();
    // Three 20px buttons, two 8px gaps and a separator take 85px.
    withWidth(1000);
    withHeight(50);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, {
      bar: rail,
      orientation: 'vertical',
      drawCommands: true,
    });
    flushSync();
    expect(split(view.container, '[data-command]').live.length).toBeLessThan(3);
    expect(split(view.container, 'button[title="More"]').live).toHaveLength(1);
  });

  it('moves with Up and Down, and leaves Left and Right alone', async () => {
    withWidth(1000);
    withHeight(1000);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, {
      bar: rail,
      orientation: 'vertical',
    });
    flushSync();
    const button = (label: string) => buttonOf(view.container, label);
    button('Zoom out').focus();
    await press('ArrowRight');
    expect(document.activeElement).toBe(button('Zoom out'));
    await press('ArrowDown');
    expect(document.activeElement).toBe(button('Zoom in'));
    await press('ArrowUp');
    expect(document.activeElement).toBe(button('Zoom out'));
  });

  it('opens its "More" menu beside the toolbar', async () => {
    withWidth(1000);
    withHeight(0);
    const { view } = await viewerWith(keyCommands(), ToolbarHarness, {
      bar: rail,
      orientation: 'vertical',
    });
    flushSync();
    await fireEvent.click(split(view.container, 'button[title="More"]').live[0]!);
    const menu = view.getByRole('menu');
    expect(menu.style.insetInlineStart).toBe('100%');
    expect(menu.style.top).toBe('0px');
  });
});

describe('useStripView', () => {
  it('is null while nothing applies, and follows what each command shows', async () => {
    let selected = false;
    const strip: BarSchema = {
      id: 'selection',
      sections: {
        center: [group('copy', ['text:copy', 'text:unknown']), group('zoom', ['zoom:in'])],
      },
    };
    const view = {
      read: () => useStripView(strip),
      pick: (value: unknown) =>
        (value as ReturnType<typeof useStripView>).current?.groups.map((each) =>
          each.commands.map((command) => command.id),
        ) ?? null,
      seen: [] as unknown[],
    };
    const { kernel } = await viewerWith(
      [
        counterPlugin,
        commandsPlugin({
          commands: [
            { id: 'text:copy', label: 'Copy', visible: () => selected },
            { id: 'zoom:in', label: 'Zoom in', visible: () => selected },
          ],
        }),
      ],
      Probes,
      { probes: [view] },
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(latest(view.seen)).toBeNull();

    selected = true;
    kernel.capability(CounterToken, 'a').touch();
    flushSync();
    expect(latest(view.seen)).toEqual([['text:copy'], ['zoom:in']]);
  });
});
