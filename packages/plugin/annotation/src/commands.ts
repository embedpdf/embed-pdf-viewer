/**
 * @embedpdf/plugin-annotation/commands — the annotation plugin's command:
 * delete the selected annotations. The tools have their commands from the
 * interaction plugin (`tool:<id>`). Each framework's `/annotation` has the
 * list ready as `annotationCommands`. The i18n plugin has its label.
 */
import type { CommandDefinition } from '@embedpdf/core';

import { AnnotationToken } from './contract';

/** The annotation plugin's commands: `annotation:delete`. */
export function createAnnotationCommands(): readonly CommandDefinition[] {
  return [
    {
      id: 'annotation:delete',
      labelKey: 'commands.annotation.delete',
      label: 'Delete',
      icon: 'delete',
      shortcut: ['Delete', 'Backspace'],
      categories: ['annotation'],
      run: (context) => context.get(AnnotationToken).selection.delete({ signal: context.signal }),
      enabled: (context) => {
        const annotation = context.tryGet(AnnotationToken);
        if (!annotation) return false;
        const selected = annotation.selection.getSelected();
        // `isEditable`: the annotation plugin's `editable` setting lets people change it by hand.
        return (
          selected.length > 0 &&
          selected.every(({ ref }) => annotation.canDelete(ref) && annotation.isEditable(ref))
        );
      },
    },
  ];
}
