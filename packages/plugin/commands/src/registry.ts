/** A command definition with its shortcuts parsed once, and how the registry tells a family apart. */
import { parseShortcut, type ParsedShortcut } from '@embedpdf/core-ui';

import type { CommandDef, CommandFamily } from './contract';

export interface RegisteredCommand {
  readonly definition: CommandDef;
  readonly shortcuts: readonly string[];
  readonly parsed: readonly ParsedShortcut[];
}

export const registeredCommand = (definition: CommandDef): RegisteredCommand => {
  const shortcuts =
    definition.shortcut === undefined ? [] : ([] as string[]).concat(definition.shortcut);
  return { definition, shortcuts, parsed: shortcuts.map(parseShortcut) };
};

export const isCommandFamily = (item: CommandDef | CommandFamily): item is CommandFamily =>
  'prefix' in item;

/** The commands the settings define, by id (a later id replaces an earlier one), and their families. */
export interface ConfiguredCommands {
  readonly commands: ReadonlyMap<string, RegisteredCommand>;
  readonly families: readonly CommandFamily[];
}

export function configuredCommands(
  items: readonly (CommandDef | CommandFamily)[],
): ConfiguredCommands {
  const commands = new Map<string, RegisteredCommand>();
  const families: CommandFamily[] = [];
  for (const item of items) {
    if (isCommandFamily(item)) families.push(item);
    else commands.set(item.id, registeredCommand(item));
  }
  return { commands, families };
}
