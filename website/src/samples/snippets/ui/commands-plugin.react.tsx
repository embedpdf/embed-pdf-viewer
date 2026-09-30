import { commandsPlugin, standardCommands } from '@embedpdf/react/commands';

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
