<!-- Generated from docs/content/headless/viewing/render.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-render

Rendering for EmbedPDF: draws sharp pages at every zoom, with tiles for deep zoom.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/render`   | [Rendering](https://www.embedpdf.com/docs/headless/react/viewing/render)   |
| Vue     | `@embedpdf/vue/render`     | [Rendering](https://www.embedpdf.com/docs/headless/vue/viewing/render)     |
| Svelte  | `@embedpdf/svelte/render`  | [Rendering](https://www.embedpdf.com/docs/headless/svelte/viewing/render)  |
| Angular | `@embedpdf/angular/render` | [Rendering](https://www.embedpdf.com/docs/headless/angular/viewing/render) |

## In React

The render plugin draws the pages. Put `<RenderLayer>` in each page, and the plugin decides what
to render, how big and when, keeps the results cached, and redraws only the pages whose content
changed:

**`basic.tsx`**

```tsx
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Stage className="stage">{() => <RenderLayer />}</Stage>
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

- **Sharp text.** Pages render at exactly the pixels your screen needs, so small text stays crisp,
  even on a low-resolution display.
- **A memory ceiling.** A whole-page picture is never wider than 640 device pixels. Zooming in
  further uses small tiles for the part you can see, so deep zoom never asks for a giant image.
- **Caching.** Scrolling away and back is instant, and two views of the same page share one render.

## License

Apache-2.0
