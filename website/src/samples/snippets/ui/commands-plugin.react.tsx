import { AnnotationToken } from '@embedpdf/react/annotation';
import { commandsPlugin, standardCommands } from '@embedpdf/react/commands';
import { DocumentsToken } from '@embedpdf/react/runtime';
import { approveDocument } from './review';

export const plugins = [
  /* … */
  commandsPlugin({
    commands: [
      ...standardCommands,
      {
        id: 'review:approve',
        label: 'Approve',
        icon: 'check',
        shortcut: 'Mod+Enter',
        enabled: ({ get }) => get(AnnotationToken).canCreate(),
        run: ({ get }) => approveDocument(get(DocumentsToken)),
      },
    ],
  }),
];
