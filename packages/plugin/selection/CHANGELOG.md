# @embedpdf/plugin-selection

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Rewritten on the kernel's `create()` controller hook with a public contract (`/contract`) and a host lens (`/contract/host`). Public: `canSelect`/`canCopy`; `select`, `selectAll`, new `selectPage`, `selectWordAt`, `selectLineAt`, `extendTo` (the last three were host-only), `clear`; `hasSelection`, `getSnapshot` (was `snapshot`, now reference-stable), new `getRange`, `listSelectedPages` (was `selectedPages`), `listSegments` (was `segmentsForPage`), `listRects` (was `rectsForPage`), `getAnchor` (was `menuAnchor`; `SelectionMenuAnchor` is `SelectionAnchor`); `readText(options?)` and new `readTextInRange(range, options?)`. Events are kernel event hooks with a `ChangeOrigin`: `onChanged`, `onCommitted` (gesture end only, carries the range), `onCleared`. Writes without `doc.text.select` throw `PluginError('permission-denied')`; an unknown page is `not-found`. `SelectionConfig.dragThreshold` replaces the hard-coded drag threshold.

  Host (`SelectionHostCapability`): `ensureLoaded(page): Promise<void>` (was `ensurePage`), `isLoaded`, `isOverText`, `beginGesture`, `beginGestureAt` (was `beginAt`), `endGesture` (was `end`), `isGestureActive` (was the public `isSelecting`), `setHighlightVisible`, `isHighlightVisible` (was `highlightVisible`). `clear()` no longer settles the gesture — `endGesture` owns that. `SelectionHandleTarget` speaks the same verbs.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `select({ page, start, count })`, `segmentsForPage`, `rectsForPage` and the host gesture methods take a `PageRef`; snapshots, endpoints, ranges, menu anchors, glyph pointers and `selectedPages()` carry refs.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Selection has live settings: `dragThreshold`, `color` and `handles` (`color`, `shadow`), with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `selectionPlugin(config)` registers them over `SELECTION_DEFAULTS` (`SelectionConfig` is `DeepPartial<SelectionSettings>`); they exist before any document opens, and a change reaches every document at once: a new `dragThreshold` applies to the next press. A `color` of `null`, the default, follows the viewer's accent (at 35% for the selected text).

  `selectionState` declares the selection's state for every framework: `hasSelection`, `isSelecting`, `range` and `pages`. `isSelecting()` is public and replaces the host lens's `isGestureActive()`.

  A page argument (`selectPage`, `selectWordAt`, `selectLineAt`, `extendTo`, `listSegments`, `listRects`) is a `PageRef` or an index: the verbs throw `not-found` for a page that isn't in the document, and the reads answer empty. `readText()` refuses without `doc.text.copy` whether or not anything is selected, and `readTextInRange()` refuses under its own name. A `signal` stops either read at once with `operation-cancelled`; the page text it started reading is still kept for the next read.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A page's text geometry is also re-read after an annotation flatten painted into it, so text that a flattened free-text note adds to the page becomes selectable.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the rest of the selection handles' policy, so every framework adapter shares it: `selectionHandleViewOf(stage)` (the handles' view over a Stage), `selectionHandleEndpointsOf(snapshot)` (both ends of the selection, or null) and `armSelectionHandle(selection, view, endpoints, role)` (the point a press grabbed and the drag it starts from the opposite end).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the interaction contract (`claimCursor`, from `/contract/host`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A refused call names what was missing: `error.permission` is `'doc.text.select'` for the selecting verbs and `'doc.text.copy'` for `readText`.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish bundle-safe `/contract` and `/contract/host` entries over the same selection token so sibling features can use selection protocols without gesture, reducer, or plugin wiring. `/internal` retains its framework implementation helpers and makes no bundle-purity promise.

## 3.0.0-next.10

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
