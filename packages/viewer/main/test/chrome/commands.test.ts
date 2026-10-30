/**
 * The viewer's commands, as Buttons & commands says: a command of yours whose functions get
 * `get` by a plugin's name, the `viewer` and the `documentId`; one with a built-in id merging
 * over the built-in command; a shortcut of yours taking its keys from the built-in ones; a
 * command for each tool of yours; the built-in commands asking the plugins' `can*` checks, not
 * scope names; the icons; and the shortcuts sheet's groups.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCapabilityToken,
  createKernel,
  type CapabilityToken,
  type Engine,
} from '@embedpdf/core';
import { commandsPlugin } from '@embedpdf/plugin-commands';
import {
  CommandsToken,
  type CommandContext as PluginCommandContext,
  type CommandDef as PluginCommandDef,
  type ResolvedCommand,
} from '@embedpdf/plugin-commands/contract/host';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LAYOUT } from '../../../chrome/src/config/chrome';
import { defaultCommands, toolCommandsFor } from '../../../chrome/src/config/commands';
import { FULLSCREEN_COMMAND } from '../../../chrome/src/config/fullscreen';
import { panelCommandsFor } from '../../../chrome/src/config/panels';
import {
  mergeCommand,
  resolveViewerCommands,
  toPluginCommand,
  type CommandScope,
} from '../../../chrome/src/config/viewer-commands';
import type { PluginTokens, Viewer } from '../../../chrome/src/handle';
import { ICON_PATHS, hasIcon, iconPathsOf, pathsOfIcon } from '../../../chrome/src/ui/icons';
import { shortcutGroupsOf } from '../../../chrome/src/ui/shortcuts-sheet';

const here = dirname(fileURLToPath(import.meta.url));
const COMMANDS_PAGE = readFileSync(
  resolve(here, '../../../../../docs/content/viewer/customize/commands.mdx'),
  'utf8',
);

const StageToken = createCapabilityToken<{ zoomIn(): void }>('stage');
const stage = { zoomIn: vi.fn() };
const PLUGINS: PluginTokens = { stage: StageToken as CapabilityToken<unknown> };

/** A command context over one capability, for the document `doc`. */
function pluginContext(args?: unknown): PluginCommandContext {
  const tryGet = <T>(token: CapabilityToken<T>): T | null =>
    token === (StageToken as CapabilityToken<unknown>) ? (stage as T) : null;
  return {
    documentId: 'doc',
    ...(args === undefined ? {} : { args }),
    tryGet,
    get: <T>(token: CapabilityToken<T>): T => {
      const capability = tryGet(token);
      if (!capability) throw new Error(`no ${token.name}`);
      return capability;
    },
  };
}

const viewer = { documents: {} } as unknown as Viewer;
const scope: CommandScope = { plugins: PLUGINS, viewer: () => viewer };

const builtIn = (id: string): PluginCommandDef =>
  defaultCommands.find((command) => command.id === id)!;

describe('a command of yours', () => {
  it('gets get by a plugin name or token, the viewer, the document and what the caller passed', () => {
    const heard: unknown[] = [];
    const command = toPluginCommand(
      {
        id: 'acme:probe',
        label: 'Probe',
        enabled: ({ get, tryGet }) =>
          (get('stage') as unknown) === stage && tryGet('search') === null,
        run: ({ get, viewer: given, documentId, args }) => {
          get('stage').zoomIn();
          heard.push({ viewer: given === viewer, documentId, args, token: get(StageToken) });
        },
      },
      scope,
    );
    expect(command.label).toBe('Probe');
    expect(command.enabled?.(pluginContext())).toBe(true);
    command.run?.(pluginContext({ page: 2 }));
    expect(stage.zoomIn).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([{ viewer: true, documentId: 'doc', args: { page: 2 }, token: stage }]);
  });

  it('throws for a plugin name the viewer has, naming the ones it has, and before the viewer is live', () => {
    const command = toPluginCommand(
      { id: 'acme:typo', run: ({ get }) => void get('staeg' as never) },
      scope,
    );
    expect(() => command.run?.(pluginContext())).toThrow(/no plugin named "staeg".*stage/);
    const early = toPluginCommand(
      { id: 'acme:early', run: ({ viewer: given }) => void given.documents },
      { plugins: PLUGINS, viewer: () => null },
    );
    expect(() => early.run?.(pluginContext())).toThrow(/not live/);
  });

  it('shows its own label in a running viewer', async () => {
    const engine = { destroy: async () => {} } as unknown as Engine;
    const { commands } = resolveViewerCommands(
      [],
      [{ id: 'acme:approve', label: 'Approve', icon: 'check', run: () => {} }],
      scope,
      { isMac: false },
    );
    const kernel = createKernel({ engine, plugins: [commandsPlugin({ commands })] });
    await kernel.start();
    expect(kernel.capability(CommandsToken).resolveCommand('acme:approve')).toMatchObject({
      label: 'Approve',
      icon: 'check',
      visible: true,
      enabled: true,
    } satisfies Partial<ResolvedCommand>);
    await kernel.destroy();
  });
});

describe('a command with a built-in id', () => {
  const resolved = (given: Parameters<typeof resolveViewerCommands>[1], isMac = false) =>
    resolveViewerCommands(defaultCommands, given, scope, { isMac });
  const find = (commands: readonly PluginCommandDef[], id: string) =>
    commands.find((command) => command.id === id)!;

  it('changes only the fields it gives: the label, icon, shortcut and checks stay', () => {
    const run = vi.fn();
    const { commands } = resolved([{ id: 'document:download', run }]);
    const download = find(commands, 'document:download');
    const original = builtIn('document:download');
    expect(download).toMatchObject({
      labelKey: original.labelKey,
      icon: 'download',
      shortcut: 'Mod+S',
      categories: ['documents.download'],
      allowed: original.allowed,
      notAllowedKey: 'commands.notAllowed.doc-download',
    });
    download.run?.(pluginContext());
    expect(run).toHaveBeenCalledTimes(1);
    // It takes the built-in one's place, once.
    expect(commands.filter((command) => command.id === 'document:download')).toHaveLength(1);
    expect(commands.indexOf(download)).toBe(defaultCommands.indexOf(original));
  });

  it('replaces the label as a whole, and what it does as a whole', () => {
    const { commands } = resolved([
      { id: 'document:print', label: 'Print it' },
      { id: 'menu:document', run: () => {} },
    ]);
    const print = find(commands, 'document:print');
    expect(print.label).toBe('Print it');
    expect(print.labelKey).toBeUndefined();
    expect(print.modal).toBe(builtIn('document:print').modal);
    expect(print.modal).toBeDefined();
    expect(find(commands, 'menu:document').menu).toBeUndefined();
    expect(
      mergeCommand({ id: 'x', panel: 'notes', icon: 'eye' }, { id: 'x', menu: 'more' }),
    ).toEqual({ id: 'x', menu: 'more', icon: 'eye' });
  });

  it('merges over a command the layout brings, as its panel and mode commands do', () => {
    const viewerCommands = resolved([{ id: 'panel:search', shortcut: 'Mod+K' }]);
    const [search] = panelCommandsFor({ search: DEFAULT_LAYOUT.panels!.search! }, () => false);
    expect(viewerCommands.isYours('panel:search')).toBe(true);
    expect(viewerCommands.isYours('document:download')).toBe(false);
    expect(viewerCommands.over(search!)).toMatchObject({
      id: 'panel:search',
      panel: { id: 'search', focus: true },
      labelKey: 'panels.search',
      shortcut: 'Mod+K',
      categories: ['search'],
    });
  });
});

describe('a shortcut of yours', () => {
  it('takes its keys from every built-in command that has them', async () => {
    const viewerCommands = resolveViewerCommands(
      defaultCommands,
      [{ id: 'acme:save', label: 'Save', shortcut: 'Mod+S', run: () => {} }],
      scope,
      { isMac: true },
    );
    const download = viewerCommands.commands.find((command) => command.id === 'document:download');
    expect(download?.shortcut).toEqual([]);
    // The key of a command the layout brings goes the same way: Find's, with the search panel.
    const find = panelCommandsFor({ search: DEFAULT_LAYOUT.panels!.search! }, () => false).find(
      (command) => command.id === 'search:find',
    );
    const claiming = resolveViewerCommands(
      [],
      [{ id: 'acme:find', label: 'Find', shortcut: 'Cmd+F' }],
      scope,
      { isMac: true },
    );
    expect(claiming.over(find!).shortcut).toEqual([]);

    const engine = { destroy: async () => {} } as unknown as Engine;
    const kernel = createKernel({
      engine,
      plugins: [commandsPlugin({ commands: viewerCommands.commands })],
    });
    await kernel.start();
    const stroke = { key: 's', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false };
    expect(kernel.capability(CommandsToken).matchStroke(stroke, { isMac: true })).toEqual({
      commandId: 'acme:save',
      refusal: null,
    });
    await kernel.destroy();
  });

  it('is the same keys only on the platform where they are: Ctrl+S is Mod+S off a Mac', () => {
    const given = [{ id: 'acme:save', shortcut: 'Ctrl+S' }];
    const download = (isMac: boolean) =>
      resolveViewerCommands(defaultCommands, given, scope, { isMac }).commands.find(
        (command) => command.id === 'document:download',
      )?.shortcut;
    expect(download(false)).toEqual([]);
    expect(download(true)).toBe('Mod+S');
  });
});

describe('a tool of yours', () => {
  it('gets a tool:<id> command, labelled and drawn from its meta or the tool it extends', () => {
    const commands = toolCommandsFor(
      [
        { id: 'approved', extends: 'free-text', meta: { label: 'Approved' } },
        { id: 'red-pen', extends: 'ink', meta: { label: 'Red pen', icon: 'pen' } },
        { id: 'highlight', defaults: { color: '#fde047' } },
      ],
      (id) => defaultCommands.some((command) => command.id === id),
    );
    expect(commands.map((command) => command.id)).toEqual(['tool:approved', 'tool:red-pen']);
    expect(commands[0]).toMatchObject({
      label: 'Approved',
      icon: 'freeText',
      categories: ['annotations.text'],
      notAllowedKey: 'commands.notAllowed.annotations-create',
    });
    expect(commands[1]).toMatchObject({ label: 'Red pen', icon: 'pen' });
    const activateTool = vi.fn();
    const context = {
      ...pluginContext(),
      tryGet: () => ({ activateTool, getActiveToolId: () => 'approved' }),
    } as unknown as PluginCommandContext;
    commands[0]!.run?.(context);
    expect(activateTool).toHaveBeenCalledWith('approved');
    expect(commands[0]!.active?.(context)).toBe(true);
  });
});

describe('the built-in commands', () => {
  const documentedIds = (() => {
    const table = COMMANDS_PAGE.split('## Every built-in command')[1]!.split('\n## ')[0]!;
    return [...table.matchAll(/`([a-z-]+:[a-z0-9-]+)`/g)].map((match) => match[1]!);
  })();

  it('ask the plugins’ can* checks whether the session may, never scope names', () => {
    const panels = panelCommandsFor(DEFAULT_LAYOUT.panels, () => false);
    for (const command of [...defaultCommands, ...panels]) {
      expect({ id: command.id, requires: command.requires }).toEqual({
        id: command.id,
        requires: undefined,
      });
    }
    const checked = (ids: string[]) =>
      ids.filter(
        (id) =>
          typeof [...defaultCommands, ...panels].find((c) => c.id === id)?.allowed !== 'function',
      );
    expect(
      checked([
        'document:download',
        'document:print',
        'tool:highlight',
        'tool:text-field',
        'tool:stamp',
        'tool:redact',
        'redaction:apply',
        'measurement:calibrate',
        'selection:copy',
        'selection:highlight',
        'annotation:stamp-from-selection',
        'panel:search',
        'search:find',
        'panel:comments',
        'panel:stamps',
        'panel:redaction',
        'page:rotate-clockwise',
        'page:delete',
        'page:duplicate',
        'page:insert-blank',
        'page:insert-file',
        'page:extract',
        'menu:page',
      ]),
    ).toEqual([]);
  });

  it('are every one the page lists, with the panels and modes the default layout brings', () => {
    const ids = new Set([
      ...defaultCommands.map((command) => command.id),
      ...panelCommandsFor(DEFAULT_LAYOUT.panels, () => false).map((command) => command.id),
      FULLSCREEN_COMMAND,
    ]);
    expect(documentedIds.length).toBeGreaterThan(80);
    expect(documentedIds.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('act on selected text from the bar over it: copy, highlight, underline, strike out', () => {
    expect(DEFAULT_LAYOUT.bars!.selection!.center).toEqual([
      {
        id: 'selection',
        items: [
          'selection:copy',
          'selection:highlight',
          'selection:underline',
          'selection:strikeout',
        ],
        importance: 4,
      },
    ]);
  });

  it('have the keys the pages name', () => {
    const shortcutOf = (id: string) => builtIn(id).shortcut;
    expect(shortcutOf('document:open')).toBe('Mod+O');
    expect(shortcutOf('document:download')).toBe('Mod+S');
    expect(shortcutOf('document:print')).toBe('Mod+P');
    expect(shortcutOf('annotation:delete')).toEqual(['Delete', 'Backspace']);
    expect(shortcutOf('help:shortcuts')).toBe('?');
    expect(shortcutOf('history:undo')).toBe('Mod+z');
  });
});

describe('icons', () => {
  it('take a path, several, or { paths, fill } to fill them', () => {
    expect(pathsOfIcon('M1 1h2')).toEqual(['M1 1h2']);
    expect(pathsOfIcon(['M1 1h2', 'M3 3h2'])).toEqual(['M1 1h2', 'M3 3h2']);
    expect(pathsOfIcon({ paths: ['M4 4h16v16H4z'], fill: true })).toEqual([
      { d: 'M4 4h16v16H4z', fill: true },
    ]);
    expect(pathsOfIcon({ paths: 'M4 4h16' })).toEqual(['M4 4h16']);
  });

  it('of yours replace a built-in one of the same name', () => {
    expect(iconPathsOf('download', { download: 'M2 2h20' })).toEqual(['M2 2h20']);
    expect(iconPathsOf('download', {})).toBe(ICON_PATHS.download);
    expect(iconPathsOf('nothing', {})).toBeNull();
    // Only the viewer's own names count as built-in, not an object's.
    expect(hasIcon('toString')).toBe(false);
  });

  it('are every one the page lists, and every one a built-in command names', () => {
    const listed = COMMANDS_PAGE.split("### The viewer's icons")[1]!.split('\n### ')[0]!;
    const names = [...listed.matchAll(/`([a-zA-Z0-9]+)`/g)].map((match) => match[1]!);
    expect(names.length).toBeGreaterThan(40);
    expect(names.filter((name) => !hasIcon(name))).toEqual([]);
    expect(
      defaultCommands.filter((command) => command.icon && !hasIcon(command.icon)).map((c) => c.id),
    ).toEqual([]);
  });
});

describe('the shortcuts sheet', () => {
  const resolvedFor = (id: string, label: string, shortcuts: string[], visible = true) =>
    ({ id, label, shortcuts, visible, enabled: true }) as unknown as ResolvedCommand;

  it('groups every command with a shortcut, leaving out what’s refused or not there now', () => {
    const table: Record<string, ResolvedCommand> = {
      'zoom:in': resolvedFor('zoom:in', 'Zoom In', ['Mod+=']),
      'document:print': resolvedFor('document:print', 'Print', ['Mod+P']),
      'document:open': resolvedFor('document:open', 'Open', ['Mod+O'], false),
      'annotation:delete': resolvedFor('annotation:delete', 'Delete', ['Delete'], false),
      'history:undo': resolvedFor('history:undo', 'Undo', ['Mod+z']),
      'acme:save': resolvedFor('acme:save', 'Save', ['Mod+S']),
      'tool:highlight': resolvedFor('tool:highlight', 'Highlight', ['Mod+H']),
    };
    const commands = {
      listShortcuts: () =>
        Object.values(table).flatMap((command) =>
          command.shortcuts.map((shortcut) => ({ commandId: command.id, shortcut })),
        ),
      getRefusal: (id: string) =>
        id === 'tool:highlight' ? { reason: 'not-allowed' as const, message: 'no' } : null,
      resolveCommand: (id: string) => table[id] ?? null,
    };
    expect(shortcutGroupsOf(commands, 'doc')).toEqual([
      {
        titleKey: 'shortcuts.document',
        rows: [{ commandId: 'document:print', label: 'Print', shortcuts: ['Mod+P'] }],
      },
      {
        titleKey: 'shortcuts.viewing',
        rows: [{ commandId: 'zoom:in', label: 'Zoom In', shortcuts: ['Mod+='] }],
      },
      {
        titleKey: 'shortcuts.editing',
        rows: [
          { commandId: 'annotation:delete', label: 'Delete', shortcuts: ['Delete'] },
          { commandId: 'history:undo', label: 'Undo', shortcuts: ['Mod+z'] },
        ],
      },
      {
        titleKey: 'shortcuts.other',
        rows: [{ commandId: 'acme:save', label: 'Save', shortcuts: ['Mod+S'] }],
      },
    ]);
  });
});
