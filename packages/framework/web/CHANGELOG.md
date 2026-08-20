# @embedpdf/web

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Add `bindPaintedImage`, a framework-neutral browser adapter for binding object-URL raster sources to image elements. It hides incomplete images, owns abort and URL-revocation cleanup, and reports painted and unpainted state around the image's presented lifetime so React, Vue, Svelte, and Angular adapters can share the same minimal lifecycle.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add framework-neutral anchored-overlay projection and placement utilities for Stage and standalone page surfaces. Add browser clipboard helpers for selected-text prefetch, native copy events, keyboard fallback, and user-initiated clipboard writes while keeping selection plugins DOM-free.

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces framework-independent browser adapters for EmbedPDF v3. It centralizes DOM-facing services such as file selection, clipboard access, printing, downloads, and external navigation so core packages remain platform-neutral.
