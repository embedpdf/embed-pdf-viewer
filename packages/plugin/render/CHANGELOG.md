# @embedpdf/plugin-render

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#777](https://github.com/embedpdf/embed-pdf-viewer/pull/777) by [@bobsingor](https://github.com/bobsingor) – Scope tile state by view and page so multiple views of the same page can plan rasters independently without invalidating each other. Replace the flat tile methods with a reference-stable `render.tilesFor(view)` handle that binds the view identity for planning, paint reporting, and release.

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Add a configurable render strategy for exact and lattice-backed deployments, with separate full-page and tile-plane budgets, format conformance, settled level selection, and public paint settings.

  Deep-zoom tiling now uses bled overlap, presentation-aware generation retention, bounded fetch backpressure and raster residency, stage-less demand limits, stronger raster identities, failure isolation, and optional diagnostics. These changes keep tile memory bounded while preventing stale reuse, visible seams, and quality regressions during zoom and pan transitions.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the document-scoped rendering capability for EmbedPDF v3. It conforms page requests to the engine's render policy, manages abortable raster loading, and provides the tile planning and retention system used for sharp deep zoom.
