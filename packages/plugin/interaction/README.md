<!-- Generated from docs/content/headless/ui/tools.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-interaction

Tools and the pointer for EmbedPDF: the active tool, the cursor and touch.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/interaction`   | [Tools, cursors & touch](https://www.embedpdf.com/docs/headless/react/ui/tools)   |
| Vue     | `@embedpdf/vue/interaction`     | [Tools, cursors & touch](https://www.embedpdf.com/docs/headless/vue/ui/tools)     |
| Svelte  | `@embedpdf/svelte/interaction`  | [Tools, cursors & touch](https://www.embedpdf.com/docs/headless/svelte/ui/tools)  |
| Angular | `@embedpdf/angular/interaction` | [Tools, cursors & touch](https://www.embedpdf.com/docs/headless/angular/ui/tools) |

## In React

At any moment one **tool** is active, and it decides what a click or a drag on the page does: select
text, scroll, draw a rectangle, place a stamp. The interaction plugin keeps track of it, and every
feature that uses the pointer works through it. Register `interactionPlugin()`:

**`interaction-plugin.tsx`**

```tsx
import { interactionPlugin } from '@embedpdf/react/interaction';
import { renderPlugin } from '@embedpdf/react/render';
import { stagePlugin } from '@embedpdf/react/stage';

export const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];
```

Then switch tools from your toolbar:

**`tool-switch.tsx`**

```tsx
import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';

export function ToolSwitch() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return (
    <>
      <button aria-pressed={activeToolId === 'pointer'} onClick={() => interaction.activateTool('pointer')}>
        Select
      </button>
      <button aria-pressed={activeToolId === 'pan'} onClick={() => interaction.activateTool('pan')}>
        Hand
      </button>
    </>
  );
}
```

## License

Apache-2.0
