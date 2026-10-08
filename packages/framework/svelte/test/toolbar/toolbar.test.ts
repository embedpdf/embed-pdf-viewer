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
