---
'@embedpdf/vue': minor
---

Add the viewing and text entry points to `@embedpdf/vue`: `page-view`, `selection`, `search` and `link`.

- `@embedpdf/vue/page-view`: `<PageView :page :width>` shows one page without a Stage, by its ref or its index, with every layer working as it does on the Stage (`:document-id`, `:page-frame`, a `#fallback` slot until the page exists, a `#page-chrome` slot for the reserved frame; `class` and `style` go on the outer box). A menu anchored to the page is placed on the window, so a card or a scrolling list can't cut it off.
- `@embedpdf/vue/selection`: `<SelectionLayer>` paints the selected text, `<SelectionMenu>` floats your content over it once it settles (`placement`, `:gap`), `<SelectionHandles>` draws the grips touch screens need in the Stage's `#overlay` slot, and `<SelectionClipboard>` wires Ctrl+C / Cmd+C (`:prefetch`). `useSelection()`, `useSelectionState()`, `useSelectionSettings()`, `useSelectionEvent()` and `copySelection` come from the same import.
- `@embedpdf/vue/search`: `<SearchLayer>` paints the matches on a page; with `@hit-click` they take clicks, told apart from a drag that starts on one. `useSearch()`, `useSearchState()`, `useSearchSettings()`, `useSearchEvent()` and `useSearchHits()`, which takes a page (or a getter of one) for one page's matches.
- `@embedpdf/vue/link`: `<LinkLayer>` makes a page's links clickable while a navigation tool is active, with a `#link="{ link, native }"` slot to draw them yourself (`<component :is="native" />` keeps what a click does). `useLink()` follows links from code and opens websites while a component uses it; `useLinkEvent()` follows the plugin's events.

Each entry re-exports its plugin, so `searchPlugin()` comes from the same import as `<SearchLayer>`.

A `<PageView>` shows the document its `<DocumentScope>` names (else the active one), and with the interaction plugin registered it is the page's pointer surface by itself, below its layers.
