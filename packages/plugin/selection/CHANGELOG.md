# @embedpdf/plugin-selection

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Use the engine's canonical text segmentation while keeping selection gestures and state in the plugin coordinate seam.

  `SelectionSnapshot.pages` now carries segments only, with boxes exposed as derived views through `segment.rect` and `rectsForPage()`. Public geometry exports are now `buildSelectionPageGeometry`, `contentPointToPdf`, `toContentSegment`, and `toContentTextQuad`.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Builds selections as oriented line segments, exposes their semantic quads and reading direction, and anchors selection endpoints to glyph cells while retaining AABB access for scrolling and conservative regions.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces framework-independent text selection. It reads engine text geometry, maps PDF coordinates into viewer content space, hit-tests glyphs, and exposes highlight geometry through the shared interaction system.
