# @embedpdf/core-annotation

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Model carets anchored to rotated text as oriented box geometry.
  - Add `caretGeomFromAnchor`, which places the caret at the trailing glyph edge and derives its authoring rotation from the text baseline while preserving the previous byte-identical upright geometry.
  - Carry optional rotation on caret geometry, apply it to local-frame hit testing, and expose an oriented selection outline without enabling caret rotate or resize gestures.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Models text-markup annotations with semantic text quads and adds oriented caret anchors, allowing highlight, underline, strikeout, squiggly, caret, and replace-text geometry to follow the selected text frame.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt annotation domain core. It contains the framework-free annotation model, update/effect logic, content-space geometry, hit testing, and drawing-tool behavior shared by every UI integration.
