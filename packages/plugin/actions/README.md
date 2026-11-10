<!-- Generated from docs/content/headless/documents/actions.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-actions

PDF actions for EmbedPDF: runs what a document does by itself, such as its buttons, its scripts and printing.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/actions`   | [Actions & scripts](https://www.embedpdf.com/docs/headless/react/documents/actions)   |
| Vue     | `@embedpdf/vue/actions`     | [Actions & scripts](https://www.embedpdf.com/docs/headless/vue/documents/actions)     |
| Svelte  | `@embedpdf/svelte/actions`  | [Actions & scripts](https://www.embedpdf.com/docs/headless/svelte/documents/actions)  |
| Angular | `@embedpdf/angular/actions` | [Actions & scripts](https://www.embedpdf.com/docs/headless/angular/documents/actions) |

## In React

A PDF can do things by itself: a button that resets a form, a field that adds up others, a link that
opens a website, a script that runs when the document opens. The actions plugin runs them, with
rules you choose. Register it, and install the browser's defaults for opening websites and printing
once, near the top of your viewer:

**`actions-setup.tsx`**

```tsx
import { actionsPlugin, useActionsUiAdapter } from '@embedpdf/react/actions';

export const plugins = [/* … */ actionsPlugin()];

export function ViewerShell() {
  useActionsUiAdapter();
  return <>{/* your viewer */}</>;
}
```

Without it, the plugin still runs what stays inside the viewer, such as going to a page or resetting
a form, but it won't open a website or a print dialog.

## License

Apache-2.0
