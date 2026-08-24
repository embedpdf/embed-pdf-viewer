import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@embedpdf/core';
import { createCommandsCapability } from '../src/capability';
import type { CommandRegistry } from '../src/capability';
import { registerCommand } from '../src/capability';
import type { CommandDef, CommandsAction, CommandsState } from '../src/types';

/**
 * The iconAccent derivation is transport: resolve() evaluates it like the
 * other pure derivations and carries the value — with the same throw-safety
 * (a derivation that throws means "no accent", never a broken button).
 */
const ctx = {
  getState: () => ({ disabledCategories: [] }),
  core: () => ({ activeId: null }),
  get: () => {
    throw new Error('no provider');
  },
  forDocument: () => {
    throw new Error('no provider');
  },
} as unknown as PluginContext<CommandsState, CommandsAction>;

const capabilityWith = (def: CommandDef) => {
  const registry: CommandRegistry = new Map();
  registerCommand(registry, def);
  return createCommandsCapability(ctx, registry);
};

describe('resolve() carries iconAccent', () => {
  it('a derived accent lands on the resolved command', () => {
    const commands = capabilityWith({
      id: 'tool:square',
      labelKey: 'square',
      icon: 'square',
      iconAccent: () => ({ primary: '#e5484d', secondary: '#ffffff' }),
    });
    expect(commands.resolve('tool:square')?.iconAccent).toEqual({
      primary: '#e5484d',
      secondary: '#ffffff',
    });
  });

  it('null and absent derivations resolve to undefined (plain icon)', () => {
    const none = capabilityWith({ id: 'a', labelKey: 'a', iconAccent: () => null });
    expect(none.resolve('a')?.iconAccent).toBeUndefined();
    const absent = capabilityWith({ id: 'b', labelKey: 'b' });
    expect(absent.resolve('b')?.iconAccent).toBeUndefined();
  });

  it('a throwing derivation falls back to no accent, like the other derivations', () => {
    const commands = capabilityWith({
      id: 'tool:ink',
      labelKey: 'ink',
      iconAccent: (c) => ({ primary: (c.get as () => never)() }),
    });
    const resolved = commands.resolve('tool:ink');
    expect(resolved).not.toBeNull(); // the button still renders…
    expect(resolved?.iconAccent).toBeUndefined(); // …just untinted
  });
});
