# @embedpdf/plugin-annotation

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add selection-aware rich-text editing for FreeText annotations. Font, size, color, bold, italic, and underline changes apply to selected text while editing, or to the annotation's default style otherwise.

  Expose text-format commands and selection state, preserve styled runs through debounced writes, and map registered font families to the live editor's mounted fonts.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Refresh widget appearances after visual signature fills and signing, and reload annotations when a new document version is published. Add box styling for signature widgets and expose annotation interaction priorities and the armed-stamp tool ID for cooperating plugins.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Stamps can be placed without the pointer and ghosted at any zoom. `placeStamp(input, placement)` creates a stamp annotation by code — the same validation, fit, page clamp, `/Name`, and `/Subj` a click after `armStamp` produces — and resolves to the new annotation's ref; `StampPlacement` names the page, the anchor point, an optional width, and rotation. `StampToolInput` gains `name` (the placed `/Name`) and `subject` (the placed `/Subj`), and its `preview` now also accepts a `StampPreviewProvider`: a function the hover ghost asks for a render at the device pixel width it is displayed at. Requests are bucketed to powers of two (`previewBucket`) and cached per bucket for the arm's lifetime, so a zoom gesture never renders per frame. The host capability's `armedStampPreview(devicePixelWidth?)` is now asynchronous and takes that width.

  `armStamp` no longer clears the payload it just set when activating the built-in stamp tool from another active tool. Armed stamps now place correctly instead of falling through to the tool's source callback, while the legacy `annotation-stamp` tool tag remains supported.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Registers the action engine's session-visibility sink (`applySessionVisibility` on the host lens) when `@embedpdf/plugin-actions` is present, and carries the full activate action tree + annotation ref on `LinkNavItem` so the nav layer can delegate chains to the dispatcher.

  The pointer-driven hover diff feeds annotation `/AA` cursorEnter/cursorExit through the shared hover pump while reducer-side clears, widgets, links, and tree-less items stay inert. `LinkNavItem` also carries hover-event presence flags for the link plane.

  Publish bundle-safe `/contract` and `/contract/host` entries over the same annotation token, plus the focused `/authoring` helper entry. `/internal` keeps its implementation-helper meaning and no longer serves as the sibling bundle boundary.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The session-visibility overlay is RETIRED — `applySessionVisibility` is replaced by `commitScriptEffects`, the annotation DOCUMENT-commit sink: script/Hide effects become engine `annotations.update` patches (colors crossing the Acrobat-array → engine boundary, `/AP` regenerated engine-side), authority-enforced, stop-on-failure, with the owner reconciling its own model per touched page.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add whole-document annotation hydration with event replay and desync
  recovery, a comments and review-state API, and an attached-link lens backed by
  substrate annotations. Add per-record permission checks and keep conversation
  records out of painting, hit testing, and selection.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add touch-aware tool consent, hit targets, drag handling, and cancellation so annotation editing cooperates with navigation gestures. Text-edit operations now report whether they handled a gesture, and the annotation capability token includes a missing-plugin hint.

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add `markupFromSelection()` for creating one oriented text-markup annotation per selected page and clearing the consumed selection. Multi-click draft finish and cancel actions are also available on the public annotation capability for composable menu controls.

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
