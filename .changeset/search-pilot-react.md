---
'@embedpdf/react': minor
---

`<SearchLayer>` paints matches in the search plugin's `highlight` setting, and the `--epdf-search-highlight`, `--epdf-search-highlight-active` and `--epdf-search-blend-mode` CSS variables win over it; its `color`, `activeColor` and `blendMode` props are gone. With `onHitClick`, only a click calls it: a press that travels 4 px (10 px for a finger) is a drag, which selects text, and the press always reaches the page.

`useSearchState()` is built from the plugin's `searchState` declaration: it returns `activeHitIndex` (was `activeIndex`) and `activeHit`, takes a selector, and returns the empty state without a document. `useSearchHits(page?)` returns every match or one page's (a ref or an index), as the plugin's reference-stable arrays, and an empty list without a document or for a page that isn't in it. `useSearchSettings()` returns the search settings, with or without a document.

`settingsHook(token)` turns any plugin's settings into a hook, `const useSearchSettings = settingsHook(SearchToken)`: it reads through `kernel.settingsOf`, so it works before the first document opens, takes a selector, and re-renders only when a setting changes. The stand-in `useSearch()` and other plugin hooks return without a document now forwards the four settings calls to the plugin's settings, so `updateSettings()` works before a document is open; every other method still throws `not-ready`.
