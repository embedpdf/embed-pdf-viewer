# @embedpdf/engine

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Implement local per-record collaboration permission checks for annotation
  creation, mutation, and group assignment. Update scope guards and the local
  runtime integration to support the new annotation and security contracts.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement `pages.insertBlank` in the local document pages service. Blank-page
  requests use the worker protocol, enforce the page-assembly capability, and
  publish the resulting `pages.inserted` document event.

## 3.0.0-next.8

## 3.0.0-next.7

### Patch Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Update the generated default WASM URL to use the current engine runtime release instead of the previous prerelease.

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Fix the default inline image-encoder worker path so it creates the bundled blob worker instead of attempting to fetch `/inline` and silently falling back to main-thread encoding. Tile rendering now keeps encoding work off the main thread under the default configuration.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Return full-fidelity page text snapshots and character-space search ranges from the local engine. Non-printing and supplementary-plane text now round-trip consistently through extraction, search geometry, selection ranges, and text slicing.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Returns orientation-aware page text geometry from the local engine so consumers can select and annotate rotated, sheared, and mirrored text without collapsing glyph cells into axis-aligned boxes.

### Patch Changes

- [#751](https://github.com/embedpdf/embed-pdf-viewer/pull/751) by [@bobsingor](https://github.com/bobsingor) – Export the shared document types (`OpenInput`, `OpenOptions`, `DocumentHandle`, `PageHandle`, `DocumentCapabilities`, `TokenSource`, …) from the package root, mirroring `@cloudpdf/engine`, so code driving the engine directly can name them without importing from the transitive `@embedpdf/engine-core` dependency.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt local Engine v3 implementation. It runs the EmbedPDF Runtime in a Web Worker for browsers or inline for Node.js and exposes the same abortable document interface as the CloudPDF engine.
