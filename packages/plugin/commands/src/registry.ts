/** The definition registry: definitions plus their pre-parsed shortcuts. */
import { PluginError } from '@embedpdf/core';
import { parseShortcut, type ParsedShortcut } from '@embedpdf/core-ui';

import type { CommandDef, RegisterCommandOptions } from './contract';

export interface RegisteredCommand {
  readonly definition: CommandDef;
  readonly shortcuts: readonly string[];
  readonly parsed: readonly ParsedShortcut[];
}

export type CommandRegistry = Map<string, RegisteredCommand>;

/** Put a definition into the registry. A duplicate id throws `conflict` unless `replace`. */
export function addCommand(
  registry: CommandRegistry,
  definition: CommandDef,
  options: RegisterCommandOptions = {},
): RegisteredCommand {
  if (registry.has(definition.id) && !options.replace) {
    throw new PluginError('conflict', 'commands', `duplicate command '${definition.id}'`);
  }
  const shortcuts =
    definition.shortcut === undefined ? [] : ([] as string[]).concat(definition.shortcut);
  const entry: RegisteredCommand = { definition, shortcuts, parsed: shortcuts.map(parseShortcut) };
  registry.set(definition.id, entry);
  return entry;
}
