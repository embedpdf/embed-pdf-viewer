<!-- Generated from docs/content/headless/documents/outline.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-outline

The outline for EmbedPDF: shows a document's bookmarks as a tree, follows them, and adds, renames, moves and deletes them.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/outline`   | [Outline](https://www.embedpdf.com/docs/headless/react/documents/outline)   |
| Vue     | `@embedpdf/vue/outline`     | [Outline](https://www.embedpdf.com/docs/headless/vue/documents/outline)     |
| Svelte  | `@embedpdf/svelte/outline`  | [Outline](https://www.embedpdf.com/docs/headless/svelte/documents/outline)  |
| Angular | `@embedpdf/angular/outline` | [Outline](https://www.embedpdf.com/docs/headless/angular/documents/outline) |

## In React

A document's outline is its table of contents: titled items, nested, each going to a place in the
document. Acrobat calls the items bookmarks. Register `outlinePlugin()` to show it in your UI:

**`outline-list.tsx`**

```tsx
import { useOutline, useOutlineState } from '@embedpdf/react/outline';

export function OutlineList() {
  const outline = useOutline();
  const { rows, current } = useOutlineState();

  return (
    <ul role="tree">
      {rows.map(({ item, depth, hasChildren, expanded }) => (
        <li
          key={item.ref.objectNumber}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-current={item.ref.objectNumber === current?.objectNumber ? 'location' : undefined}
          style={{ paddingInlineStart: depth * 16 }}
        >
          {hasChildren && (
            <button onClick={() => outline.toggle(item.ref)}>{expanded ? '▾' : '▸'}</button>
          )}
          <button onClick={() => outline.activate(item.ref)}>{item.title}</button>
        </li>
      ))}
    </ul>
  );
}
```

What `useOutlineState()` gives you updates by itself: after your own changes, and on a shared
document, after someone else's. Nothing is read when a document opens: the outline loads the first
time something asks for it, so a document nobody shows the outline of costs nothing.

## License

Apache-2.0
