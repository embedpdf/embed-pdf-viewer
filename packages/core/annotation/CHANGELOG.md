# @embedpdf/core-annotation

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add distance drawing with separate endpoint and leader placement, four geometry handles, and directly draggable captions. Keep previews, hit testing, and selection bounds aligned, including short dimensions with outside arrows and displaced-label connectors. Measurement labels use the engine's PDF-coordinate rounding rules.

  Rotate measurements around the center of their complete oriented selection frame, including leaders and displaced captions. Use the same frame for pointer rotation, quarter turns, reset, selection, and hit testing, keeping the center stable after a saved appearance is reloaded. Attach the rotation handle to the selection border without extra measurement-specific spacing.

  Add perimeter and area creation through the existing polyline and polygon gestures, live labels, direct caption dragging, and complete selection bounds. Carry manual PDF-space caption centers through whole-shape transforms while vertex edits leave them fixed. Reject invalid area creation and vertex edits.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add pure helpers for normalizing rich-text runs, mapping text offsets, and reading or applying styles to a text range. Support rich-text updates and bold, italic, and underline properties in the annotation model while keeping plain contents synchronized.

  Align FreeText and callout text insets, borders, and backgrounds with their PDF appearances.

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Session-visibility overlay: `Model.sessionHidden` with `setSessionHidden`/`forgetSessionHidden`/`clearSessionHidden` messages, composed through the new `effFlags`/`effBearer` lenses so Hide actions and scripts flip presentation-only visibility (paint, hit-testing, selectability, handles) without ever touching the document `/F` flags — and a session-SHOWN annotation is live, not painted-but-dead. The overlay survives page reloads and is forgotten only on true deletes.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `sessionHidden`, `effFlags`/`effBearer`, and the session-visibility messages are REMOVED — visibility is document truth again (`/F` flags, mutated through the normal write path), and every paint/hit/selection gate reads the annotation's own flags.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add comment-thread and review-state composition, attached-link substrate
  helpers, conversation-plane filtering, and per-record annotation authority.
  Align annotation grouping, hit testing, geometry, and sparse property updates
  with the new comments, links, and permission model.

## 3.0.0-next.9

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
