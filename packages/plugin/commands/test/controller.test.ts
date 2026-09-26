import { createCapabilityToken } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { CommandDef, CommandsConfig } from '../src/contract';
import { createCommandsController } from '../src/controller';
import { initialCommandsState } from '../src/model';

/** The controller over a real test context: workspace-scoped, no document, no siblings. */
function harness(config: CommandsConfig = {}) {
  const ctx = createTestContext({
    id: 'commands',
    state: initialCommandsState(config.disabledCategories),
    doc: null,
  });
  const commands = ctx.connect(createCommandsController(ctx, config));
  return { ctx, commands };
}

const capabilityWith = (definition: CommandDef) => harness({ commands: [definition] }).commands;

describe('resolution carries iconAccent', () => {
  it('lands a derived accent on the resolved command', () => {
    const commands = capabilityWith({
      id: 'tool:square',
      labelKey: 'square',
      icon: 'square',
      iconAccent: () => ({ primary: '#e5484d', secondary: '#ffffff' }),
    });
    expect(commands.resolveCommand('tool:square')?.iconAccent).toEqual({
      primary: '#e5484d',
      secondary: '#ffffff',
    });
  });

  it('resolves null and absent derivations to no accent (a plain icon)', () => {
    const none = capabilityWith({ id: 'none', labelKey: 'none', iconAccent: () => null });
    expect(none.resolveCommand('none')?.iconAccent).toBeUndefined();
    const absent = capabilityWith({ id: 'absent', labelKey: 'absent' });
    expect(absent.resolveCommand('absent')?.iconAccent).toBeUndefined();
  });

  it('falls back to no accent when the derivation throws, like the other derivations', () => {
    const MissingToken = createCapabilityToken<{ color: string }>('missing');
    const commands = capabilityWith({
      id: 'tool:ink',
      labelKey: 'ink',
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
    const first: CommandDef = { id: 'zoom:in', labelKey: 'first' };
    const second: CommandDef = { id: 'zoom:in', labelKey: 'second' };
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
    const { ctx, commands } = harness({ commands: [{ id: 'zoom:in', labelKey: 'in' }] });
    const listener = vi.fn();
    ctx.subscribe(listener);
    const ids = commands.listCommandIds();
    const listed = commands.listCommands();
    const shortcuts = commands.listShortcuts();

    const remove = commands.registerCommand({ id: 'zoom:out', labelKey: 'out', shortcut: 'Mod+-' });
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
        { id: 'zoom:in', labelKey: 'in', categories: ['zoom'] },
        { id: 'print', labelKey: 'print', shortcut: ['Mod+P'] },
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
        { id: 'save', labelKey: 'save', run },
        { id: 'locked', labelKey: 'locked', enabled: () => false },
        { id: 'secret', labelKey: 'secret', visible: () => false },
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
          labelKey: 'broken',
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
      commands: [{ id: 'highlight', labelKey: 'highlight', categories: ['annotate'] }],
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

describe('through the kernel', () => {
  it('resolves capabilities the command definitions use, though the plugin cannot declare them', async () => {
    const { createKernel, definePlugin } = await import('@embedpdf/core');
    const { commandsPlugin } = await import('../src/commands.plugin');
    const { CommandsToken } = await import('../src/token');
    const toggleToken = createCapabilityToken<{ isOn(): boolean }>('toggle');
    const toggle = definePlugin<void, { isOn(): boolean }>({
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
              labelKey: 'check',
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
