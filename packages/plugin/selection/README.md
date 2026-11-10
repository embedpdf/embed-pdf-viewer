<!-- Generated from docs/content/headless/text/selection.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-selection

Text selection for EmbedPDF: selecting and copying a document's text.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/selection`   | [Selecting & copying](https://www.embedpdf.com/docs/headless/react/text/selection)   |
| Vue     | `@embedpdf/vue/selection`     | [Selecting & copying](https://www.embedpdf.com/docs/headless/vue/text/selection)     |
| Svelte  | `@embedpdf/svelte/selection`  | [Selecting & copying](https://www.embedpdf.com/docs/headless/svelte/text/selection)  |
| Angular | `@embedpdf/angular/selection` | [Selecting & copying](https://www.embedpdf.com/docs/headless/angular/text/selection) |

## In React

The selection plugin lets people select text with the mouse or a finger, and lets your code select the
same text. Register `interactionPlugin()` and `selectionPlugin()`, and put `<SelectionLayer>`
above the page:

**`basic.tsx`**

```tsx
import { useEffect } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin, useSelection } from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Something to see on load: "Documents", the first word on the cover, selected from code.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 28, count: 9 });
  }, [selection, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTitle />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
```

**`basic.css`**

```css
/* Colors */
:root {
  --muted: #5a6b92;
  --line: #e6eaf2;
  --canvas: #f7f9fc;
  --shadow: rgb(7 32 76 / 0.04);
}

/* The pages */
.stage {
  height: 460px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--canvas);
  box-shadow:
    0 1px 2px var(--shadow),
    0 18px 40px -28px rgb(7 32 76 / 0.28);
}

.loading {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
```

`interactionPlugin()` is the input system every tool shares: the Stage passes the pointer to it,
the selection plugin handles it, and `<SelectionLayer>` draws the result. So you can restyle or
replace the highlight without touching how selecting works.

Selecting uses where the characters are on the page, not the text itself. Nothing reads the page's
text until your code asks for it, and a document can allow selecting while it forbids copying (see
[Permissions](https://www.embedpdf.com/docs/headless/react/text/selection#permissions)).

## License

Apache-2.0
