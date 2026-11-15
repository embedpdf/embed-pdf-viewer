<!-- Generated from docs/content/headless/ui/commands.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-commands

Commands for EmbedPDF: named actions with a label, an icon, a state and a shortcut, for toolbars, menus and the keyboard.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/commands`   | [Commands & shortcuts](https://www.embedpdf.com/docs/headless/react/ui/commands)   |
| Vue     | `@embedpdf/vue/commands`     | [Commands & shortcuts](https://www.embedpdf.com/docs/headless/vue/ui/commands)     |
| Svelte  | `@embedpdf/svelte/commands`  | [Commands & shortcuts](https://www.embedpdf.com/docs/headless/svelte/ui/commands)  |
| Angular | `@embedpdf/angular/commands` | [Commands & shortcuts](https://www.embedpdf.com/docs/headless/angular/ui/commands) |

## In React

A **command** is one action of your viewer, like "zoom in" or "download", defined once: its label, its
icon, when it's enabled or active, what it does, and its keyboard shortcut. Toolbars, menus, a command
palette and the keyboard all run the same command, so they always agree. Register the plugin with the
commands you need:

**`commands-plugin.tsx`**

```tsx
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
```

## License

Apache-2.0
