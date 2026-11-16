/**
 * @embedpdf/plugin-history/commands — undo and redo. Without the history
 * plugin, both stay disabled. Focus in a text field keeps its own undo:
 * shortcuts skip text fields. Each framework's `/history` has the list ready
 * as `historyCommands`. The i18n plugin has their labels.
 */
import type { CommandContext, CommandDefinition } from '@embedpdf/core';

import { HistoryToken } from './contract';

const historyOf = (context: CommandContext) => context.tryGet(HistoryToken);

/** The history plugin's commands: `history:undo` and `history:redo`. */
export function createHistoryCommands(): readonly CommandDefinition[] {
  return [
    {
      id: 'history:undo',
      labelKey: 'commands.history.undo',
      label: 'Undo',
      icon: 'undo',
      shortcut: 'Mod+Z',
      categories: ['history'],
      run: (context) => historyOf(context)?.undo(),
      enabled: (context) => historyOf(context)?.canUndo() ?? false,
    },
    {
      id: 'history:redo',
      labelKey: 'commands.history.redo',
      label: 'Redo',
      icon: 'redo',
      shortcut: ['Mod+Shift+Z', 'Mod+Y'],
      categories: ['history'],
      run: (context) => historyOf(context)?.redo(),
      enabled: (context) => historyOf(context)?.canRedo() ?? false,
    },
  ];
}
