/**
 * @embedpdf/plugin-selection/commands — the selection's command: copy. It
 * reaches the clipboard, which plugins never touch, so the list is made with
 * the browser's part; each framework's `/selection` has it ready as
 * `selectionCommands`. The i18n plugin has its label.
 */
import type { CommandDefinition } from '@embedpdf/core';

import { SelectionToken, type SelectionCapability } from './contract';

/** What the selection's commands need from the browser. */
export interface SelectionCommandsPlatform {
  /** Copy the selected text to the clipboard. */
  copySelection(selection: SelectionCapability): Promise<unknown>;
}

/** The selection's commands: `selection:copy`, with the browser's part from `platform`. */
export function createSelectionCommands(
  platform: SelectionCommandsPlatform,
): readonly CommandDefinition[] {
  return [
    {
      id: 'selection:copy',
      labelKey: 'commands.selection.copy',
      label: 'Copy',
      icon: 'copy',
      shortcut: 'Mod+C',
      categories: ['selection'],
      run: (context) => platform.copySelection(context.get(SelectionToken)),
      // `canCopy()` in `enabled`, not `allowed`: a refused command keeps its keys, and Mod+C
      // with nothing selected in the viewer belongs to the page. The clipboard wiring says
      // when a selection may not be copied.
      enabled: (context) => {
        const selection = context.tryGet(SelectionToken);
        return !!selection && selection.hasSelection() && selection.canCopy();
      },
    },
  ];
}
