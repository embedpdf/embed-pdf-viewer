// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { commandsPlugin } from '../src/commands';
import type { ResolvedCommand } from '../src/commands';
import { Toolbar, custom, group, useStripView } from '../src/toolbar';
import type { BarSchema, StripView } from '../src/toolbar';
import { CounterToken, bytesInput, counterPlugin, viewerWith } from './counter-plugin';

/**
 * `<Toolbar>`: the render props draw the parts, the fit decides which show, what didn't fit goes
 * into the "More" menu, and command state stays live. happy-dom lays nothing out, so an element
 * here is as wide as its text (10px a character) and the toolbar as wide as `room`.
 */

let room = 1000;
beforeEach(() => {
  room = 1000;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const width = (this.textContent ?? '').trim().length * 10;
    return { width, height: 20, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 20 } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => room);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

/** The command renderer used below: a button with the command's label, pressed when active. */
const renderCommand = (command: ResolvedCommand, _variant: string, runIt: () => void) => (
  <button className="cmd" aria-pressed={command.active} onClick={runIt}>
    {command.label}
  </button>
);

async function mountToolbar(toolbar: React.ReactNode) {
  const { kernel } = await viewerWith([counterPlugin, commands()], toolbar);
  await act(() => kernel.documents.open(bytesInput('a')));
  return kernel;
}

/** What the live row shows: the elements outside the hidden measurement layer. */
const live = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => !element.closest('[aria-hidden="true"]'),
  );

describe('<Toolbar>', () => {
  it('draws every command through renderCommand when there is room', async () => {
    await mountToolbar(<Toolbar bar={bar} renderCommand={renderCommand} />);
    expect(live('button.cmd').map((button) => button.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(live('button[title="More"]')).toHaveLength(0);

    fireEvent.click(live('button.cmd')[0]!);
    expect(run.one).toHaveBeenCalled();
  });

  it('moves what does not fit into the "More" menu, whose rows run and close it', async () => {
    room = 70;
    await mountToolbar(<Toolbar bar={bar} renderCommand={renderCommand} />);
    const shown = live('button.cmd').map((button) => button.textContent);
    expect(shown.length).toBeLessThan(3);

    const more = live('button[title="More"]');
    expect(more).toHaveLength(1);
    fireEvent.click(more[0]!);
    const rows = live('[role="menu"] button');
    const hidden = rows.map((row) => row.textContent?.replace('• ', ''));
    expect([...shown, ...hidden].sort()).toEqual(['One', 'Three', 'Two']);

    fireEvent.click(rows[0]!);
    expect(live('[role="menu"]')).toHaveLength(0);
  });

  it('closes the "More" menu on a press outside it, not on one inside it or on its button', async () => {
    room = 70;
    await mountToolbar(<Toolbar bar={bar} renderCommand={renderCommand} />);
    const more = live('button[title="More"]')[0]!;
    fireEvent.click(more);
    fireEvent.pointerDown(live('[role="menu"] button')[0]!);
    fireEvent.pointerDown(more);
    expect(live('[role="menu"]')).toHaveLength(1);

    fireEvent.pointerDown(document.body);
    expect(live('[role="menu"]')).toHaveLength(0);
  });

  it('keeps command state live', async () => {
    pressed = false;
    const kernel = await mountToolbar(<Toolbar bar={bar} renderCommand={renderCommand} />);
    const two = () => live('button.cmd').find((button) => button.textContent === 'Two')!;
    expect(two().getAttribute('aria-pressed')).toBe('false');

    pressed = true;
    act(() => kernel.capability(CounterToken, 'a').touch());
    expect(two().getAttribute('aria-pressed')).toBe('true');
    pressed = false;
  });

  it('draws a custom item through its renderer, and its command where the renderer returns undefined', async () => {
    const schema: BarSchema = {
      id: 'main',
      sections: {
        center: [group('page', [custom('page-number', 'page:go-to'), custom('other', 'one')])],
      },
    };
    await mountToolbar(
      <Toolbar
        bar={schema}
        renderCommand={renderCommand}
        renderCustom={{
          'page-number': (variant) => <span className="page-number">Page ({variant})</span>,
          other: () => undefined,
        }}
      />,
    );
    expect(live('.page-number').map((found) => found.textContent)).toEqual(['Page (default)']);
    expect(live('button.cmd').map((button) => button.textContent)).toEqual(['One']);
  });

  it('without a renderer, a custom item is a native slot holding its command, measured live', async () => {
    const schema: BarSchema = {
      id: 'main',
      sections: { center: [group('page', [custom('page-number', 'page:go-to')])] },
    };
    await mountToolbar(<Toolbar bar={schema} renderCommand={renderCommand} />);
    const sockets = [...document.querySelectorAll('slot[name="page-number"]')];
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.closest('[aria-hidden="true"]')).toBeNull();
    expect(sockets[0]!.textContent).toBe('Go to');
  });

  it('draws the default parts without render props', async () => {
    await mountToolbar(<Toolbar bar={bar} />);
    expect(live('button').map((button) => button.textContent)).toEqual(['One', 'Two', 'Three']);
  });
});

describe('useStripView', () => {
  it('is the visible commands of a bar, and null when none is', async () => {
    const views: (StripView | null)[] = [];
    function Probe({ schema }: { schema: BarSchema | undefined }) {
      views.push(useStripView(schema));
      return null;
    }
    const { kernel, rerender } = await viewerWith(
      [counterPlugin, commands()],
      <Probe schema={bar} />,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const latest = () => views[views.length - 1];
    expect(latest()?.groups.map((each) => each.commands.map((command) => command.id))).toEqual([
      ['one', 'two'],
      ['three'],
    ]);

    rerender(<Probe schema={undefined} />);
    expect(latest()).toBeNull();
  });
});
