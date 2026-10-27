# @embedpdf/plugin-search

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `SearchState`, what `searchState` reads and `useSearchState()` returns, the State table of the search page with a comment on each field. Published types now name it instead of spelling out its fields.

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Search hits carry `page: PageRef`; `hitsForPage(page)` and `startPage` take a `PageRef`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Rewritten on the kernel's `create()` controller hook with a newest-wins lane for the session. `search()` and `refresh()` (was `rerun`) are awaitable and resolve `{ status, hitCount }`; new `cancel()` keeps the hits found so far. Reads are `getQuery`, `getStatus`, `listHits(filter?)`, `getHitCount`, `listPagesWithHits`, `getActiveHitIndex`, `getActiveHit`, `getProgress`, `getError`; navigation is `nextHit`, `previousHit`, `goToHit`, `revealActiveHit`. Typed events: `onStarted`, `onProgress`, `onCompleted`, `onCancelled`, `onFailed`, `onActiveHitChanged`, `onCleared`. Per-page hit arrays are reference-stable. `SearchPluginConfig` is now `SearchConfig`; `TextSegment` and `SearchMode` are exported.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Expose search hit ranges as `start` and `count`, report progress as
  `pagesSearched` and `pageCount`, and use `from` to select the starting page.
  Callers can request snippets with a boolean option, with permission checks
  that match whether result text will be returned.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Search has live settings: `reveal` (`anchor`, `behavior`) and `highlight` (`color`, `activeColor`, `blendMode`), with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `searchPlugin(config)` registers them over `SEARCH_DEFAULTS` (`SearchConfig` is `DeepPartial<SearchSettings>`), and a change reaches every document at once: `updateSettings({ reveal })` applies to the next `nextHit()`. The settings exist before any document opens.

  `searchState` declares the search's state for every framework: `query`, `status`, `hitCount`, `activeHitIndex` (was `activeIndex`), `activeHit`, `progress` and `error`. `onProgress` is now `onProgressChanged`, carrying `hitCount`, `pagesSearched` and `pageCount` (`SearchProgressChangedEvent`). It fires whenever `getProgress()` changes: once per slice of pages a search gets through, and back to none when a new search starts or `clear()` drops the session. `onStarted`, `onCompleted`, `onCancelled` and `onFailed` no longer carry `operationId`. `search()`, `refresh()` and `findAll()` take `{ signal }`, and cancelling stops the engine's work on the running slice; a newer search still replaces an older one. A page argument (`search(query, { from })`, `listHits({ page })`, `getHitCount(page)`) is a `PageRef` or an index. `search()` rejects `not-found` for a `from` page that isn't in the document, while `listHits({ page })` and `getHitCount(page)` answer `[]` and `0` for it, so a layer reading while its page is deleted still renders. `listPagesWithHits()` lists the pages in document order, which moving a page changes. `search()` and `findAll()` refuse without `doc.text.search` with `permission-denied` before asking the engine, and `canSearch()` reads the same permission. A refusal only rejects: the session stays as it was and no event fires, not even `onFailed`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `goToHit()` takes the hit itself as well as its index, so `<SearchLayer onHitClick={(hit) => search.goToHit(hit)}>` makes a clicked match the active one. A hit kept from before the search ran again is found by the characters it covers; one that isn't among the current hits returns `null` and changes nothing.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the stage contract (`getCurrentPage`, `reveal(ref)`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A search with no `from` starts at the Stage's current page through its `PageRef`.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the search token, query validation, results, and capability types without scan, effect, or plugin wiring.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add `canSearch(mode)` so hosts can gate search and snippet controls using the
  session's text-search and text-copy permissions.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

### Patch Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Keep search result ranges aligned with selection character space when extracted text contains non-printing or supplementary-plane characters. A result's `charStart` and `charCount` can now be passed to selection and markup flows without offset drift.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Represent search-hit geometry as canonical `segments: TextSegment[]` with a precomputed `bounds` envelope. Search reveal now passes that envelope directly to `stage.reveal(hit.pageIndex, { rect: hit.bounds })` instead of manually folding rectangles.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt document-search plugin. It drives budgeted engine search, converts result geometry into viewer coordinates, prioritizes visible pages, and reveals the active result through the stage.
