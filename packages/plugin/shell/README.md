<!-- Generated from docs/content/headless/ui/panels.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-shell

Panels and menus for EmbedPDF: keeps track of which panels, dialogs and menus are open.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/shell`   | [Panels & dialogs](https://www.embedpdf.com/docs/headless/react/ui/panels)   |
| Vue     | `@embedpdf/vue/shell`     | [Panels & dialogs](https://www.embedpdf.com/docs/headless/vue/ui/panels)     |
| Svelte  | `@embedpdf/svelte/shell`  | [Panels & dialogs](https://www.embedpdf.com/docs/headless/svelte/ui/panels)  |
| Angular | `@embedpdf/angular/shell` | [Panels & dialogs](https://www.embedpdf.com/docs/headless/angular/ui/panels) |

## In React

A viewer has sidebars (thumbnails, comments, search), dialogs and menus. The shell plugin keeps track of
which are open, so a toolbar button, a keyboard shortcut and your own code can all open the same
panel, and you can remember the layout for next time. You draw the panels; the plugin only holds their
state. Register `shellPlugin()`:

**`shell-plugin.tsx`**

```tsx
import { shellPlugin } from '@embedpdf/react/shell';

export const plugins = [/* … */ shellPlugin()];
```

Then ask for a panel by name:

**`comments-panel.tsx`**

```tsx
import { useSurface } from '@embedpdf/react/shell';
import { CommentList } from './comment-list';

export function CommentsPanel() {
  const panel = useSurface('comments');
  if (!panel.isOpen) return null;

  return (
    <aside>
      <button onClick={panel.close}>Close</button>
      <CommentList />
    </aside>
  );
}

export function CommentsButton() {
  const panel = useSurface('comments');
  return <button onClick={() => panel.toggle({ exclusive: 'right' })}>Comments</button>;
}
```

The names are yours: `'comments'`, `'thumbnails'`, `'settings'`. Each document keeps its own, so every
tab remembers which panels were open.

## License

Apache-2.0
