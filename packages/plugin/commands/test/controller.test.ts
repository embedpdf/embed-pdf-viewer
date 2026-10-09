import { createCapabilityToken } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  COMMANDS_DEFAULTS,
  type CommandDef,
  type CommandFamily,
  type CommandsConfig,
} from '../src/contract';
import { createCommandsController } from '../src/controller';

/** The controller over a real test context: workspace-scoped, no document, no siblings. */
function harness(config: CommandsConfig = {}) {
  const ctx = createTestContext({
    id: 'commands',
    settings: { defaults: COMMANDS_DEFAULTS, registered: config },
    doc: null,
  });
  const commands = ctx.connect(createCommandsController(ctx));
  return { ctx, commands };
}

const capabilityWith = (definition: CommandDef) => harness({ commands: [definition] }).commands;

describe('resolution carries iconAccent', () => {
  it('lands a derived accent on the resolved command', () => {
    const commands = capabilityWith({
      id: 'tool:square',
      label: 'square',
      icon: 'square',
      iconAccent: () => ({ primary: '#e5484d', secondary: '#ffffff' }),
    });
    expect(commands.resolveCommand('tool:square')?.iconAccent).toEqual({
      primary: '#e5484d',
      secondary: '#ffffff',
    });
  });

  it('resolves null and absent derivations to no accent (a plain icon)', () => {
    const none = capabilityWith({ id: 'none', label: 'none', iconAccent: () => null });
    expect(none.resolveCommand('none')?.iconAccent).toBeUndefined();
    const absent = capabilityWith({ id: 'absent', label: 'absent' });
    expect(absent.resolveCommand('absent')?.iconAccent).toBeUndefined();
  });

  it('falls back to no accent when the derivation throws, like the other derivations', () => {
    const MissingToken = createCapabilityToken<{ color: string }>('missing');
    const commands = capabilityWith({
      id: 'tool:ink',
      label: 'ink',
      iconAccent: (context) => ({ primary: context.get(MissingToken).color }),
    });
    const resolved = commands.resolveCommand('tool:ink');
    expect(resolved).not.toBeNull(); // the button still renders…
    expect(resolved?.iconAccent).toBeUndefined(); // …just untinted
  });
});

describe('registry', () => {
  it('rejects a duplicate id unless replaced, and a remover owns only its registration', () => {
    const { commands } = harness();
    const first: CommandDef = { id: 'zoom:in', label: 'first' };
    const second: CommandDef = { id: 'zoom:in', label: 'second' };
    const removeFirst = commands.registerCommand(first);
    expect(() => commands.registerCommand(second)).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
    commands.registerCommand(second, { replace: true });
    removeFirst(); // must not remove the replacement
    expect(commands.getCommand('zoom:in')).toBe(second);
    expect(commands.resolveCommand('zoom:in')?.label).toBe('second');
  });

  it('wakes readers when a command is registered and again when it is removed', () => {
    const { ctx, commands } = harness({ commands: [{ id: 'zoom:in', label: 'in' }] });
    const listener = vi.fn();
    ctx.subscribe(listener);
    const ids = commands.listCommandIds();
    const listed = commands.listCommands();
    const shortcuts = commands.listShortcuts();

    const remove = commands.registerCommand({ id: 'zoom:out', label: 'out', shortcut: 'Mod+-' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(commands.listCommandIds()).not.toBe(ids);
    expect(commands.listCommandIds()).toEqual(['zoom:in', 'zoom:out']);
    expect(commands.listCommands()).not.toBe(listed);
    expect(commands.listCommands().map((command) => command.id)).toEqual(['zoom:in', 'zoom:out']);
    expect(commands.listShortcuts()).not.toBe(shortcuts);
    expect(commands.resolveCommand('zoom:out')?.label).toBe('out');

    remove();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(commands.listCommandIds()).toEqual(['zoom:in']);
    expect(commands.resolveCommand('zoom:out')).toBeNull();
    remove(); // a second call changes nothing and wakes no one
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps resolutions and lists reference-stable while nothing changed', () => {
    const { commands } = harness({
      commands: [
        { id: 'zoom:in', label: 'in', categories: ['zoom'] },
        { id: 'print', label: 'print', shortcut: ['Mod+P'] },
      ],
    });
    const resolved = commands.resolveCommand('zoom:in');
    const listed = commands.listCommands();
    expect(commands.resolveCommand('zoom:in')).toBe(resolved);
    expect(commands.listCommands()).toBe(listed);
    expect(commands.listCommandIds()).toBe(commands.listCommandIds());
    expect(commands.listShortcuts()).toBe(commands.listShortcuts());
    expect(commands.listShortcuts()).toEqual([{ commandId: 'print', shortcut: 'Mod+P' }]);

    commands.disableCategory('zoom');
    const hidden = commands.resolveCommand('zoom:in');
    expect(hidden).not.toBe(resolved);
    expect(hidden).toMatchObject({ enabled: false, visible: false });
    expect(commands.listCommands()).not.toBe(listed);
  });
});

describe('execution', () => {
  it('runs a command, reports it, and refuses hidden, disabled and unknown ones', async () => {
    const run = vi.fn();
    const { commands } = harness({
      commands: [
        { id: 'save', label: 'save', run },
        { id: 'locked', label: 'locked', enabled: () => false },
        { id: 'secret', label: 'secret', visible: () => false },
      ],
    });
    const executed: string[] = [];
    commands.onExecuted((event) => executed.push(`${event.commandId}:${String(event.args)}`));
    await expect(commands.execute('save', { args: 1 })).resolves.toEqual({ status: 'executed' });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: 1 }));
    expect(executed).toEqual(['save:1']);
    await expect(commands.execute('locked')).resolves.toEqual({
      status: 'rejected',
      reason: 'disabled',
    });
    await expect(commands.execute('secret')).resolves.toEqual({
      status: 'rejected',
      reason: 'hidden',
    });
    await expect(commands.execute('missing')).resolves.toEqual({
      status: 'rejected',
      reason: 'not-found',
    });
    expect(commands.canExecute('save')).toBe(true);
    expect(commands.canExecute('locked')).toBe(false);
  });

  it('reports a failing run and rejects with a PluginError', async () => {
    const { commands } = harness({
      commands: [
        {
          id: 'broken',
          label: 'broken',
          run: () => {
            throw new Error('boom');
          },
        },
      ],
    });
    const failures: string[] = [];
    commands.onExecutionFailed((event) => failures.push(event.error.message));
    await expect(commands.execute('broken')).rejects.toMatchObject({ capability: 'commands' });
    expect(failures).toEqual(['boom']);
  });
});

describe('category gating', () => {
  it('hides the commands of a disabled category until it is enabled again', () => {
    const { commands } = harness({
      disabledCategories: ['annotate'],
      commands: [{ id: 'highlight', label: 'highlight', categories: ['annotate'] }],
    });
    expect(commands.isCategoryDisabled('annotate')).toBe(true);
    expect(commands.resolveCommand('highlight')?.visible).toBe(false);
    commands.enableCategory('annotate');
    expect(commands.getDisabledCategories()).toEqual([]);
    expect(commands.resolveCommand('highlight')?.visible).toBe(true);
    commands.setDisabledCategories(['annotate', 'forms']);
    expect(commands.getDisabledCategories()).toEqual(['annotate', 'forms']);
  });
});

describe('settings', () => {
  it('takes its commands and categories from the settings, live', () => {
    const { ctx, commands } = harness({ commands: [{ id: 'zoom:in', label: 'In' }] });
    const changed: string[][] = [];
    commands.onSettingsChanged((event) => changed.push([...event.changed]));
    const wake = vi.fn();
    ctx.subscribe(wake);

    commands.updateSettings({
      commands: [
        { id: 'zoom:in', label: 'In' },
        { id: 'zoom:out', label: 'Out', shortcut: 'Mod+-', categories: ['zoom'] },
      ],
    });
    expect(commands.listCommandIds()).toEqual(['zoom:in', 'zoom:out']);
    expect(commands.listShortcuts()).toEqual([{ commandId: 'zoom:out', shortcut: 'Mod+-' }]);
    expect(wake).toHaveBeenCalled();

    commands.disableCategory('zoom');
    expect(commands.getSettings().disabledCategories).toEqual(['zoom']);
    expect(commands.resolveCommand('zoom:out')).toMatchObject({ enabled: false, visible: false });
    commands.disableCategory('zoom'); // already off: no change, no event
    expect(changed).toEqual([['commands'], ['disabledCategories']]);

    commands.resetSettings();
    expect(commands.listCommandIds()).toEqual(['zoom:in']);
    expect(commands.getDisabledCategories()).toEqual([]);
  });

  it('lets a later definition replace an earlier one with the same id', () => {
    const { commands } = harness({
      commands: [
        { id: 'zoom:in', label: 'Zoom in' },
        { id: 'zoom:out', label: 'Zoom out' },
        { id: 'zoom:in', label: 'Closer' },
      ],
    });
    expect(commands.listCommands().map((command) => command.label)).toEqual(['Closer', 'Zoom out']);
  });
});

describe('labels', () => {
  /** An i18n stand-in that knows one key. */
  const i18nWith = (strings: Record<string, string>) => ({
    t: (key: string, options?: { fallback?: string }) => strings[key] ?? options?.fallback ?? key,
  });

  it('shows the translated label, then the plain label, then the key or the id', async () => {
    const { createKernel, definePlugin } = await import('@embedpdf/core');
    const { I18nToken } = await import('@embedpdf/plugin-i18n/contract');
    type I18n = import('@embedpdf/plugin-i18n/contract').I18nCapability;
    const { commandsPlugin } = await import('../src/commands.plugin');
    const { CommandsToken } = await import('../src/token');
    const i18n = definePlugin({
      id: 'i18n',
      token: I18nToken,
      create: () => ({ api: i18nWith({ 'commands.save': 'Opslaan' }) as unknown as I18n }),
    });
    const kernel = createKernel({
      engine: {} as never,
      plugins: [
        i18n,
        commandsPlugin({
          commands: [
            { id: 'save', labelKey: 'commands.save', label: 'Save' },
            { id: 'open', labelKey: 'commands.open', label: 'Open' },
            { id: 'close', labelKey: 'commands.close' },
            { id: 'review:approve' },
          ],
        }),
      ],
    });
    await kernel.start();
    const labels = kernel
      .capability(CommandsToken)
      .listCommands()
      .map((command) => command.label);
    expect(labels).toEqual(['Opslaan', 'Open', 'commands.close', 'review:approve']);
    await kernel.destroy();
  });
});

describe('families', () => {
  /** `color:<name>` for each color the test lists. */
  function colorFamily(colors: { current: readonly string[] }): CommandFamily {
    return {
      prefix: 'color:',
      names: () => colors.current,
      command: (name) => ({ label: `Color ${name}`, run: vi.fn() }),
    };
  }

  it('lists one command per name, after the defined ones, and a defined id wins', () => {
    const colors = { current: ['red', 'blue'] as readonly string[] };
    const { commands } = harness({
      commands: [colorFamily(colors), { id: 'color:red', label: 'Rood' }],
    });
    expect(commands.listCommandIds()).toEqual(['color:red', 'color:blue']);
    expect(commands.listCommands().map((command) => command.label)).toEqual(['Rood', 'Color blue']);
    expect(commands.getCommand('color:blue')).toMatchObject({ id: 'color:blue' });
    expect(commands.getCommand('color:blue')).toBe(commands.getCommand('color:blue'));
    expect(commands.hasCommand('color:green')).toBe(true); // any name resolves; listing follows names()
    expect(commands.hasCommand('colour:green')).toBe(false);
    expect(commands.searchCommands('blue').map((command) => command.id)).toEqual(['color:blue']);

    colors.current = ['blue', 'green'];
    expect(commands.listCommandIds()).toEqual(['color:red', 'color:blue', 'color:green']);
  });

  it('runs a family command with its name', async () => {
    const run = vi.fn();
    const family: CommandFamily = {
      prefix: 'tool:',
      names: () => ['ink'],
      command: (name) => ({ label: name, run: () => run(name) }),
    };
    const { commands } = harness({ commands: [family] });
    await expect(commands.execute('tool:ink')).resolves.toEqual({ status: 'executed' });
    expect(run).toHaveBeenCalledWith('ink');
  });
});

describe('cancelling', () => {
  it('rejects when the signal fires, hands the signal to run, and fires no event', async () => {
    let seen: AbortSignal | undefined;
    const { commands } = harness({
      commands: [
        {
          id: 'slow',
          label: 'Slow',
          run: (context) => {
            seen = context.signal;
            return new Promise(() => {});
          },
        },
      ],
    });
    const events = vi.fn();
    commands.onExecuted(events);
    commands.onExecutionFailed(events);
    const controller = new AbortController();
    const running = commands.execute('slow', { signal: controller.signal });
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(seen).toBe(controller.signal);
    expect(events).not.toHaveBeenCalled();
    await expect(commands.execute('slow', { signal: controller.signal })).rejects.toMatchObject({
      code: 'operation-cancelled',
    });
  });
});

describe('through the kernel', () => {
  it('resolves capabilities the command definitions use, though the plugin cannot declare them', async () => {
    const { createKernel, definePlugin } = await import('@embedpdf/core');
    const { commandsPlugin } = await import('../src/commands.plugin');
    const { CommandsToken } = await import('../src/token');
    const toggleToken = createCapabilityToken<{ isOn(): boolean }>('toggle');
    const toggle = definePlugin({
      id: 'toggle',
      token: toggleToken,
      create: () => ({ api: { isOn: () => true } }),
    });
    const kernel = createKernel({
      engine: {} as never,
      plugins: [
        toggle,
        commandsPlugin({
          commands: [
            {
              id: 'toggle:check',
              label: 'check',
              enabled: (commandContext) => commandContext.tryGet(toggleToken)?.isOn() ?? false,
            },
          ],
        }),
      ],
    });
    await kernel.start();
    expect(kernel.capability(CommandsToken).resolveCommand('toggle:check')?.enabled).toBe(true);
    await kernel.destroy();
  });
});
