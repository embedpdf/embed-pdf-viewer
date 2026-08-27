# @embedpdf/plugin-selection

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#776](https://github.com/embedpdf/embed-pdf-viewer/pull/776) by [@bobsingor](https://github.com/bobsingor) – Add framework-independent selection-handle geometry and drag policies that follow rotated text, rotated pages, and RTL selection boundaries.

### Patch Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Route touch long-press selection through explicit gesture metadata, report whether word and line selection succeeded, and support optional selection feedback without swallowing unhandled gestures.

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Expand the public selection capability with permission checks, programmatic character ranges, select-all, settled gesture state, menu anchors, range snapshots, and full selected-text extraction. Host-only gesture and geometry plumbing now lives behind the `/internal` export, while clipboard access remains DOM-free and outside the plugin.

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
