# @embedpdf/plugin-search

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
