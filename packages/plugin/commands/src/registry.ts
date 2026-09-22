/** The definition registry: definitions plus their pre-parsed shortcuts. */
import { PluginError } from '@embedpdf/core';
import { parseShortcut, type ParsedShortcut } from '@embedpdf/core-ui';

import type { CommandDef, RegisterCommandOptions } from './contract';

export interface RegisteredCommand {
  readonly def: CommandDef;
  readonly shortcuts: readonly string[];
  readonly parsed: readonly ParsedShortcut[];
}

export type CommandRegistry = Map<string, RegisteredCommand>;

export function registerCommand(
  registry: CommandRegistry,
  def: CommandDef,
  options: RegisterCommandOptions = {},
): RegisteredCommand {
  if (registry.has(def.id) && !options.replace) {
    throw new PluginError('conflict', 'commands', `duplicate command '${def.id}'`);
  }
  const shortcuts = def.shortcut === undefined ? [] : ([] as string[]).concat(def.shortcut);
  const entry: RegisteredCommand = { def, shortcuts, parsed: shortcuts.map(parseShortcut) };
  registry.set(def.id, entry);
  return entry;
}
