---
'@embedpdf/angular': minor
---

Pages on their own, text selection, search and links in Angular, each a secondary entry point.

- `@embedpdf/angular/page-view`: `<epdf-page-view [page] [width]>` shows one page without a
  Stage, with the layers between its tags; `[documentId]` (the document `[epdfDocumentScope]`
  names, else the active one, without it), `[pageFrame]`, and the `epdfFallback` and
  `epdfPageChrome` templates. It takes pointer input for the tools when the interaction plugin
  is registered, and anchored UI inside it is placed on screen so nothing around it clips it.
- `@embedpdf/angular/selection`: `withSelection()`, `inject(EpdfSelection)` (the selection's
  methods, `hasSelection()`, `isSelecting()`, `range()` and `pages()` as signals, `changed$`,
  `committed$`, `cleared$`, the settings), `<epdf-selection-layer>`, `<epdf-selection-menu>` and
  `<epdf-selection-handles>` inside `<epdf-stage>`, `<epdf-selection-clipboard>` and
  `copySelection()`.
- `@embedpdf/angular/search`: `withSearch()`, `inject(EpdfSearch)` (the search's methods, its
  state as signals, `hits()` and `hitsOn(page)`, `completed$` and the other events, the
  settings) and `<epdf-search-layer (hitClick)>`, whose matches take clicks only while
  `(hitClick)` is listened to.
- `@embedpdf/angular/link`: `withLink()`, `inject(EpdfLink)` (with `activated$`), and
  `<epdf-link-layer>` with the `<ng-template epdfLink let-link let-native="native">` template.
  While either is there, a website link opens in a new tab.
- `@embedpdf/angular/interaction` adds `<epdf-page-pointer-source>`, a page's pointer input for
  a page surface of your own.
- `@embedpdf/angular/testing`: `EpdfStageHarness` and `EpdfSearchLayerHarness`, test harnesses
  built on `@angular/cdk/testing` (an optional peer dependency).
