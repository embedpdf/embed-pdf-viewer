# @embedpdf/plugin-annotation

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Round-trip rotated caret geometry through the annotation repository.

  Rotated carets now lower their logical box and content-space tilt into `/Rect`, `rotation`, and `unrotatedRect`, and reconstruct that geometry when engine annotations are ingested. Upright writes explicitly clear stale transform metadata.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Creates, previews, imports, and persists text-markup annotations with oriented quads and places caret and replace-text annotations at the selected glyph's trailing edge.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the completely rebuilt annotation plugin for EmbedPDF v3. It connects the pure annotation model to engine-backed create, update, and delete operations while contributing editing and drawing tools through the interaction system.
