/**
 * Turning commands off and on: by category, with every category under it, and
 * one by one. Both lists are settings, so they change live and
 * `resetSettings()` restores what the app registered.
 */
import type { Settings } from '@embedpdf/core';

import type { CommandDef, CommandsCapability, CommandsSettings } from '../contract';
import { isCategoryOff } from '../services/availability';

type OffList = 'disabledCategories' | 'disabledCommands';

export function createTurningOff(
  settings: Settings<CommandsSettings>,
  definitionOf: (id: string) => CommandDef | null,
  isTurnedOff: (definition: CommandDef) => boolean,
) {
  const listOf = (list: OffList): readonly string[] => settings.get()[list];
  const replace = (list: OffList, names: readonly string[]): void =>
    settings.api.updateSettings(
      list === 'disabledCategories'
        ? { disabledCategories: [...names] }
        : { disabledCommands: [...names] },
    );
  // Adding a name that's there, or removing one that isn't, changes nothing and fires nothing.
  const add = (list: OffList, name: string): void => {
    const current = listOf(list);
    if (!current.includes(name)) replace(list, [...current, name]);
  };
  const remove = (list: OffList, name: string): void => {
    const current = listOf(list);
    if (current.includes(name))
      replace(
        list,
        current.filter((other) => other !== name),
      );
  };

  return {
    getDisabledCategories: () => listOf('disabledCategories'),
    isCategoryDisabled: (category) => isCategoryOff(category, listOf('disabledCategories')),
    disableCategory: (category) => add('disabledCategories', category),
    enableCategory: (category) => remove('disabledCategories', category),
    setDisabledCategories: (categories) => replace('disabledCategories', categories),
    getDisabledCommands: () => listOf('disabledCommands'),
    isCommandDisabled: (id) => {
      const definition = definitionOf(id);
      return definition ? isTurnedOff(definition) : listOf('disabledCommands').includes(id);
    },
    disableCommand: (id) => add('disabledCommands', id),
    enableCommand: (id) => remove('disabledCommands', id),
    setDisabledCommands: (ids) => replace('disabledCommands', ids),
  } satisfies Partial<CommandsCapability>;
}
