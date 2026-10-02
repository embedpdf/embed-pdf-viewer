import { describe, expect, it, vi } from 'vitest';
import { custom, group, item, normalizeBar, type BarSchema } from '../src/schema';
import type { FitMetrics } from '../src/solver';
import {
  groupMenuView,
  layoutToolbar,
  sameStripGroups,
  stripGroupsOf,
  type ToolbarLayoutInput,
  type ToolbarPart,
} from '../src/toolbar-layout';

/**
 * `layoutToolbar` turns a fit into the parts an adapter draws: the live row's
 * sections and groups, and the measurement layer's every variant, folded group
 * and trigger, each with its command resolved and its run bound.
 */

interface Command {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly visible: boolean;
}

const registry: Record<string, Command> = Object.fromEntries(
  ['zoom:in', 'zoom:out', 'page:next', 'page:go-to', 'tool:pen', 'tool:ink'].map((id) => [
    id,
    { id, label: id.toUpperCase(), enabled: true, visible: true },
  ]),
);
registry['hidden'] = { id: 'hidden', label: 'HIDDEN', enabled: true, visible: false };

/** Every unit 40 px wide in every variant, a folded group 50, a trigger 36. */
const metrics: FitMetrics = {
  unit: (_key, variant) => (variant === 'icon+label' ? 100 : 40),
  groupCollapsed: () => 50,
  groupTrigger: () => 36,
  overflowTrigger: 40,
  gap: 10,
  separator: 20,
};

const measureKey = {
  unit: (unitKey: string, variant: string) => `u:${unitKey}@${variant}`,
  group: (groupId: string) => `g:${groupId}`,
  groupTrigger: (groupId: string) => `gt:${groupId}`,
};

function layout(schema: BarSchema, containerWidth: number, execute = vi.fn()) {
  const input: ToolbarLayoutInput<Command> = {
    bar: normalizeBar(schema),
    resolve: (id) => registry[id] ?? null,
    unregistered: (id) => ({ id, label: id, enabled: false, visible: true }),
    execute,
    menuTarget: () => null,
    metrics,
    measureKey,
    containerWidth,
  };
  return layoutToolbar(input);
}

const describePart = (part: ToolbarPart<Command>): string => {
  switch (part.kind) {
    case 'command':
      return `${part.command.id}@${part.variant}`;
    case 'custom':
      return `custom ${part.name}@${part.variant}`;
    case 'collapsed':
      return `collapsed ${part.view.id}`;
    case 'disclosure':
      return `trigger ${part.view.id}: ${part.view.commands.map((command) => command.id).join(',')}`;
  }
};

describe('layoutToolbar', () => {
  it('draws every visible command at its widest variant when there is room, in three sections', () => {
    const result = layout(
      {
        id: 'main',
        sections: {
          start: [
            group('zoom', ['zoom:out', item('zoom:in', { variants: ['icon+label', 'icon'] })]),
          ],
          end: [group('pages', ['page:next', 'page:unknown', 'hidden'])],
        },
      },
      1000,
    );
    expect(result.sections.map((section) => section.name)).toEqual(['start', 'center', 'end']);
    expect(
      result.sections.map((section) =>
        section.groups.map((each) => `${each.id}: ${each.parts.map(describePart).join(' ')}`),
      ),
    ).toEqual([['zoom: zoom:out@icon zoom:in@icon+label'], [], ['pages: page:next@icon']]);
    expect(result.hasOverflow).toBe(false);
    expect(result.overflow).toEqual([]);
  });

  it('runs a part’s command through execute', () => {
    const execute = vi.fn();
    const result = layout(
      { id: 'main', sections: { start: [group('zoom', ['zoom:in'])] } },
      1000,
      execute,
    );
    const [part] = result.sections[0]!.groups[0]!.parts;
    if (part?.kind !== 'command') throw new Error('expected a command part');
    part.run();
    expect(execute).toHaveBeenCalledWith('zoom:in');
  });

  it('measures every unit in every variant, each folded group and each shed group’s trigger', () => {
    const result = layout(
      {
        id: 'main',
        sections: {
          start: [
            group('zoom', [item('zoom:in', { variants: ['icon+label', 'icon'] })], {
              collapse: 'menu',
            }),
          ],
          end: [group('tools', ['tool:pen', 'tool:ink'], { shed: true })],
        },
      },
      1000,
    );
    expect(result.measured.map((part) => `${part.measureKey} ${describePart(part)}`)).toEqual([
      'u:zoom:zoom:in@icon+label zoom:in@icon+label',
      'u:zoom:zoom:in@icon zoom:in@icon',
      'g:zoom collapsed zoom',
      'u:tools:tool:pen@icon tool:pen@icon',
      'u:tools:tool:ink@icon tool:ink@icon',
      // Measured with the whole group behind it, so it's budgeted at its widest.
      'gt:tools trigger tools: tool:pen,tool:ink',
    ]);
  });

  it('moves what doesn’t fit into the "More" menu', () => {
    const result = layout(
      {
        id: 'main',
        sections: {
          start: [group('zoom', ['zoom:out', 'zoom:in']), group('pages', ['page:next'])],
        },
      },
      100,
    );
    expect(result.hasOverflow).toBe(true);
    const shown = result.sections.flatMap((section) =>
      section.groups.flatMap((each) => each.parts.map(describePart)),
    );
    const hidden = result.overflow.flatMap((section) => section.rows.map((row) => row.command));
    expect([...shown.map((part) => part.split('@')[0]), ...hidden].sort()).toEqual([
      'page:next',
      'zoom:in',
      'zoom:out',
    ]);
  });

  it('folds a collapsible group into one part with its visible commands', () => {
    const result = layout(
      {
        id: 'main',
        sections: {
          start: [
            group('tools', ['tool:pen', 'tool:ink', 'hidden'], {
              collapse: 'select',
              role: 'tabs',
            }),
          ],
        },
      },
      60,
    );
    const [part] = result.sections[0]!.groups[0]!.parts;
    if (part?.kind !== 'collapsed') throw new Error('expected a folded group');
    expect(part.view).toMatchObject({ id: 'tools', collapse: 'select', role: 'tabs' });
    expect(part.view.commands.map((command) => command.id)).toEqual(['tool:pen', 'tool:ink']);
  });

  it('gives a group that shed items a trigger with only the shed ones behind it', () => {
    const result = layout(
      {
        id: 'main',
        sections: {
          start: [group('tools', ['tool:pen', 'tool:ink'], { shed: true })],
        },
      },
      // One item (40), a gap (10) and the trigger (36).
      86,
    );
    expect(result.sections[0]!.groups[0]!.parts.map(describePart)).toEqual([
      'tool:pen@icon',
      'trigger tools: tool:ink',
    ]);
  });

  it('hands a custom item its name, variant, measure key and terminal command', () => {
    const execute = vi.fn();
    const result = layout(
      {
        id: 'main',
        sections: {
          center: [group('page', [custom('page-number', 'page:go-to', { variants: ['full'] })])],
        },
      },
      1000,
      execute,
    );
    const [part] = result.sections[1]!.groups[0]!.parts;
    if (part?.kind !== 'custom') throw new Error('expected a custom part');
    expect(part).toMatchObject({
      key: 'page:page-number',
      name: 'page-number',
      variant: 'full',
      measureKey: 'u:page:page-number@full',
    });
    expect(part.terminal?.id).toBe('page:go-to');
    part.runTerminal();
    expect(execute).toHaveBeenCalledWith('page:go-to');
  });
});

describe('groupMenuView', () => {
  it('is one section of the group’s commands, radio for tabs, running through the group', () => {
    const execute = vi.fn();
    const close = vi.fn();
    const commands = [registry['tool:pen']!, registry['tool:ink']!];
    const menu = groupMenuView({ id: 'tools', role: 'tabs', commands, execute }, true, close);
    expect(menu.sections).toEqual([
      {
        labelKey: undefined,
        role: 'radio',
        rows: [
          { type: 'command', command: 'tool:pen' },
          { type: 'command', command: 'tool:ink' },
        ],
      },
    ]);
    expect(menu.isOpen).toBe(true);
    expect(menu.resolve('tool:ink')).toBe(commands[1]);
    expect(menu.resolve('zoom:in')).toBeNull();
    menu.execute('tool:ink');
    expect(execute).toHaveBeenCalledWith('tool:ink');
    menu.close();
    expect(close).toHaveBeenCalled();
  });
});

describe('stripGroupsOf and sameStripGroups', () => {
  const strip = normalizeBar({
    id: 'strip',
    sections: {
      start: [group('zoom', ['zoom:out', 'hidden']), group('empty', ['hidden', 'page:unknown'])],
      end: [group('pages', ['page:next'])],
    },
  });

  it('is the visible commands of each group, resolved, without the groups that empty out', () => {
    const groups = stripGroupsOf(strip, (id) => registry[id] ?? null);
    expect(groups.map((each) => [each.id, each.commands.map((command) => command.id)])).toEqual([
      ['zoom', ['zoom:out']],
      ['pages', ['page:next']],
    ]);
  });

  it('compares strips group by group with the given command comparison', () => {
    const sameCommand = (left: Command, right: Command) =>
      left.id === right.id && left.enabled === right.enabled;
    const before = stripGroupsOf(strip, (id) => registry[id] ?? null);
    const again = stripGroupsOf(strip, (id) => (registry[id] ? { ...registry[id]! } : null));
    const disabled = stripGroupsOf(strip, (id) =>
      registry[id] ? { ...registry[id]!, enabled: id !== 'page:next' } : null,
    );
    expect(sameStripGroups(before, again, sameCommand)).toBe(true);
    expect(sameStripGroups(before, disabled, sameCommand)).toBe(false);
    expect(sameStripGroups(before, before.slice(1), sameCommand)).toBe(false);
  });
});
