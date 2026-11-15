<!-- Generated from docs/content/headless/documents/tabs.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-view-manager

Several documents for EmbedPDF: shows open documents side by side.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/view-manager`   | [Several documents](https://www.embedpdf.com/docs/headless/react/documents/tabs)   |
| Vue     | `@embedpdf/vue/view-manager`     | [Several documents](https://www.embedpdf.com/docs/headless/vue/documents/tabs)     |
| Svelte  | `@embedpdf/svelte/view-manager`  | [Several documents](https://www.embedpdf.com/docs/headless/svelte/documents/tabs)  |
| Angular | `@embedpdf/angular/view-manager` | [Several documents](https://www.embedpdf.com/docs/headless/angular/documents/tabs) |

## In React

The view manager arranges documents into panes, each with its own tabs, like split editors in a
code editor. Register `viewManagerPlugin()`, then render one Stage per pane:

**`panes.tsx`**

```tsx
import { DocumentScope } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { useViewManager, useViewManagerState } from '@embedpdf/react/view-manager';
import { PaneTabs } from './PaneTabs';

export function Panes() {
  const views = useViewManager();
  const { panes, focusedPaneId } = useViewManagerState();

  return (
    <div className="panes">
      {panes.map((pane) => (
        <section key={pane.id} data-focused={pane.id === focusedPaneId} onFocus={() => views.setFocusedPane(pane.id)}>
          <PaneTabs pane={pane} />
          {pane.activeDocumentId && (
            <DocumentScope id={pane.activeDocumentId}>
              <Stage>{() => <RenderLayer />}</Stage>
            </DocumentScope>
          )}
        </section>
      ))}
    </div>
  );
}
```

```ts
views.splitPane(documentId); // the document in a new pane, beside the focused one
views.setActiveDocument(paneId, documentId); // show another of the pane's tabs
views.moveDocumentBetween(fromPaneId, toPaneId, documentId); // drag a tab to another pane
views.deletePane(paneId); // its documents move to another pane
```

A document opened with `documents.open()` lands in the focused pane. Every call is listed under
[Methods](https://www.embedpdf.com/docs/headless/react/documents/tabs#methods).

## License

Apache-2.0
