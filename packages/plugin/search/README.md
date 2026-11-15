<!-- Generated from docs/content/headless/text/search.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-search

Text search for EmbedPDF: finds text across a document and shows every match.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/search`   | [Search](https://www.embedpdf.com/docs/headless/react/text/search)   |
| Vue     | `@embedpdf/vue/search`     | [Search](https://www.embedpdf.com/docs/headless/vue/text/search)     |
| Svelte  | `@embedpdf/svelte/search`  | [Search](https://www.embedpdf.com/docs/headless/svelte/text/search)  |
| Angular | `@embedpdf/angular/search` | [Search](https://www.embedpdf.com/docs/headless/angular/text/search) |

## In React

The search plugin finds text in the whole document and highlights every match. Register
`searchPlugin()`, put `<SearchLayer>` in each page, and search from your own search box:

**`search-box.tsx`**

```tsx
import { RenderLayer } from '@embedpdf/react/render';
import { SearchLayer, useSearch, useSearchState } from '@embedpdf/react/search';
import { Stage } from '@embedpdf/react/stage';

export function SearchBox() {
  const search = useSearch();
  const { hitCount, activeHitIndex, status } = useSearchState();

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input onChange={(event) => search.search({ text: event.target.value })} />
      {status === 'searching' && <span>Searching…</span>}
      {hitCount > 0 && (
        <span>
          {activeHitIndex + 1} of {hitCount}
        </span>
      )}
      <button type="button" onClick={() => search.previousHit()}>↑</button>
      <button type="button" onClick={() => search.nextHit()}>↓</button>
    </form>
  );
}

export function Pages() {
  return (
    <Stage>
      {() => (
        <>
          <RenderLayer />
          <SearchLayer />
        </>
      )}
    </Stage>
  );
}
```

- **Matches appear as they're found.** Large documents are searched a few pages at a time, and the
  count and the highlights grow as the search goes.
- **Searching again replaces the search.** Type another letter and the old search stops; an empty
  `text` clears it.
- **The first match becomes the active one** without moving the view. `nextHit()`, `previousHit()`
  and `goToHit(hit)` move to a match and bring it into view, and wrap around at the ends.

## License

Apache-2.0
