<!-- Generated from docs/content/headless/viewing/links.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-link

Links for EmbedPDF: makes a PDF's links to pages and websites clickable.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/link`   | [Links](https://www.embedpdf.com/docs/headless/react/viewing/links)   |
| Vue     | `@embedpdf/vue/link`     | [Links](https://www.embedpdf.com/docs/headless/vue/viewing/links)     |
| Svelte  | `@embedpdf/svelte/link`  | [Links](https://www.embedpdf.com/docs/headless/svelte/viewing/links)  |
| Angular | `@embedpdf/angular/link` | [Links](https://www.embedpdf.com/docs/headless/angular/viewing/links) |

## In React

Most PDFs have links: a table of contents that jumps to a chapter, a footnote to a website. Register
`linkPlugin()` and put `<LinkLayer>` in each page, and they work:

**`link-layer.tsx`**

```tsx
import { interactionPlugin } from '@embedpdf/react/interaction';
import { LinkLayer, linkPlugin } from '@embedpdf/react/link';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { Viewer } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), linkPlugin()];

export function Reader() {
  return (
    <Viewer engine={engine} plugins={plugins}>
      <Stage>
        {() => (
          <>
            <RenderLayer />
            <LinkLayer />
          </>
        )}
      </Stage>
    </Viewer>
  );
}
```

- **A link to a page** goes there, to the exact spot and zoom the link names.
- **A link to a website** opens in a new tab, after a safety check (see [Good to know](https://www.embedpdf.com/docs/headless/react/viewing/links#good-to-know)).
- **A link with a PDF action**, such as a button that resets a form, runs the action when the
  [actions plugin](https://www.embedpdf.com/docs/headless/react/documents/actions) is registered.

The pointer turns into a hand over a link, and a link can be reached with the Tab key and followed
with Enter.

## License

Apache-2.0
