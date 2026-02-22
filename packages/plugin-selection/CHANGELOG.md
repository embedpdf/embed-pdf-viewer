# @embedpdf/plugin-selection

## 2.6.2

### Patch Changes

- [#475](https://github.com/embedpdf/embed-pdf-viewer/pull/475) by [@bobsingor](https://github.com/bobsingor) – ### Selection plugin: Chrome PDFium parity and geometry cache eviction

  **Double-click / triple-click selection**
  - Double-click selects the word around the clicked glyph, triple-click selects the full visual line, matching Chromium's `PDFiumEngine::OnMultipleClick` behaviour.

  **Drag threshold**
  - Pointer-down no longer immediately begins a drag-selection. The pointer must move beyond a configurable `minSelectionDragDistance` (default 3 px) before selection starts, preventing accidental selections on simple clicks.

  **Tolerance-based hit-testing with tight bounds**
  - `glyphAt` now performs two-pass hit-testing adapted from PDFium's `CPDF_TextPage::GetIndexAtPos`: an exact-match pass followed by a tolerance-expanded nearest-neighbour pass using Manhattan distance.
  - Hit-testing uses tight glyph bounds (`FPDFText_GetCharBox`) instead of loose bounds (`FPDFText_GetLooseCharBox`), matching Chrome's behaviour and preventing cross-line selection jumping on short lines. Configurable via `toleranceFactor` (default 1.5).

  **Font-size-aware rectangle merging**
  - `shouldMergeHorizontalRects` now refuses to merge runs whose font sizes differ by more than 1.5x, preventing a large character (e.g. a heading "1") from merging into adjacent body-text lines.
  - `rectsWithinSlice` sub-splits runs when the horizontal gap between consecutive glyphs exceeds 2.5x the average glyph width, mirroring Chrome's `CalculateTextRunInfoAt` character-distance heuristic.

  **Geometry cache eviction (LRU)**
  - Added `maxCachedGeometries` config option (default 50) to bound per-document geometry memory. Least-recently-used pages are evicted when the limit is exceeded; pages with active UI registrations are pinned and never evicted.
  - When an evicted page scrolls back into view and falls within an active selection, its rects are lazily recomputed and pushed to the UI.

  **Marquee / text-selection coordination**
  - Introduced `hasTextAnchor` state so the marquee handler does not activate while the text handler has a pending anchor (before the drag threshold is met).

## 2.6.1

## 2.6.0

### Minor Changes

- [#447](https://github.com/embedpdf/embed-pdf-viewer/pull/447) by [@bobsingor](https://github.com/bobsingor) – Added `onEmptySpaceClick` event to `SelectionScope` and `SelectionCapability`. Fires when the user clicks directly on the page background (empty space) rather than on a child element. Detection runs before mode-gating so it fires for all modes regardless of whether text or marquee selection is enabled. New `EmptySpaceClickEvent` and `EmptySpaceClickScopeEvent` type exports.

- [#447](https://github.com/embedpdf/embed-pdf-viewer/pull/447) by [@bobsingor](https://github.com/bobsingor) – Unified text selection and marquee selection under the `enableForMode` API. Extended `EnableForModeOptions` with `enableSelection`, `showSelectionRects`, `enableMarquee`, and `showMarqueeRects` options. Deprecated `showRects` (use `showSelectionRects`), `setMarqueeEnabled`, and `isMarqueeEnabled` (use `enableForMode` with `enableMarquee`). Added `modeId` to `SelectionChangeEvent`, `BeginSelectionEvent`, `EndSelectionEvent`, `MarqueeChangeEvent`, `MarqueeEndEvent`, and their scoped counterparts. Marquee handler now uses `registerAlways` so any plugin can enable marquee for their mode. Removed `stopImmediatePropagation` from text selection handler in favor of `isTextSelecting` coordination.

  Refactored `SelectionLayer` into a thin orchestrator that composes the new `TextSelection` component and existing `MarqueeSelection` component. Consumers no longer need to render `MarqueeSelection` separately -- `SelectionLayer` now includes both text and marquee selection. Added new `TextSelection` export for advanced standalone usage. Added `textStyle` and `marqueeStyle` props to `SelectionLayer` for consistent CSS-standard styling (`background`, `borderColor`, `borderStyle`). `MarqueeSelection` updated with CSS-standard props (`background`, `borderColor`, `borderStyle`); old `stroke` and `fill` props deprecated. New `TextSelectionStyle` and `MarqueeSelectionStyle` type exports.

## 2.5.0

### Patch Changes

- [#441](https://github.com/embedpdf/embed-pdf-viewer/pull/441) by [@bobsingor](https://github.com/bobsingor) – Fixed rotation calculation in SelectionLayer components to properly combine page intrinsic rotation with document rotation:
  - Updated React `SelectionLayer` component to compute effective rotation as `(pageRotation + docRotation) % 4`
  - Updated Vue `selection-layer.vue` component with the same rotation logic
  - Updated Svelte `SelectionLayer.svelte` component with the same rotation logic

## 2.4.1

## 2.4.0

## 2.3.0

### Minor Changes

- [#406](https://github.com/embedpdf/embed-pdf-viewer/pull/406) by [@bobsingor](https://github.com/bobsingor) – Added marquee selection functionality allowing users to drag a rectangle to select multiple elements. Introduced `createMarqueeSelectionHandler` and `createTextSelectionHandler` as separate pointer event handlers that can be combined with `mergeHandlers`. Added `MarqueeSelection` component for Preact, Svelte, and Vue. Added `EnableForModeOptions` interface with `showRects` option for configurable selection behavior. Added `onMarqueeChange` and `onMarqueeEnd` events. Added `setMarqueeEnabled` and `isMarqueeEnabled` methods to the capability.

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The selection plugin now supports per-document text selection state and operations.

  ### Breaking Changes
  - **All Actions**: Now require `documentId` parameter:
    - `cachePageGeometry(documentId, page, geo)` - was `cachePageGeometry(page, geo)`
    - `setSelection(documentId, selection)` - was `setSelection(selection)`
    - `startSelection(documentId)` - was `startSelection()` (no params)
    - `endSelection(documentId)` - was `endSelection()` (no params)
    - `clearSelection(documentId)` - was `clearSelection()` (no params)
    - `setRects(documentId, rects)` - was `setRects(rects)`
    - `setSlices(documentId, slices)` - was `setSlices(slices)`
  - **State Structure**: Plugin state now uses `documents: Record<string, SelectionDocumentState>` to track per-document selection state including cached page geometry, selection ranges, rects, and slices.
  - **Action Creators**: All action creators now require `documentId`.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **SelectionLayer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-selection/react`, Svelte: `@embedpdf/plugin-selection/svelte`, Vue: `@embedpdf/plugin-selection/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Added optional `rotation` prop - if not provided, uses document state rotation
    - Added optional `selectionMenu` prop for custom selection menu rendering
    - Component subscribes to document-specific selection state and menu placement
  - **CopyToClipboard Component**:
    - Updated to handle document-scoped copy events with `{ text }` payload format

  ### New Features
  - Per-document text selection tracking
  - Per-document page geometry caching
  - Per-document selection rects and slices
  - Document lifecycle management with automatic state initialization and cleanup

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Added configurable `menuHeight` option to `SelectionPluginConfig`. This allows customizing the height used to determine whether the selection menu appears above or below the selection. Default value is `40` pixels. Also fixed type imports in Svelte `SelectionLayer` component.

  ```typescript
  createPluginRegistration(SelectionPluginPackage, {
    enabled: true,
    menuHeight: 50, // Custom menu height for placement calculations
  });
  ```

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

### Patch Changes

- [`caec11d`](https://github.com/embedpdf/embed-pdf-viewer/commit/caec11d7e8b925e641b4834aadf9a126edfb3586) by [@bobsingor](https://github.com/bobsingor) – Added configurable `menuHeight` option to `SelectionPluginConfig`. This allows customizing the height used to determine whether the selection menu appears above or below the selection. Default value is `40` pixels. Also fixed type imports in Svelte `SelectionLayer` component.

  ```typescript
  createPluginRegistration(SelectionPluginPackage, {
    enabled: true,
    menuHeight: 50, // Custom menu height for placement calculations
  });
  ```

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The selection plugin now supports per-document text selection state and operations.

  ### Breaking Changes
  - **All Actions**: Now require `documentId` parameter:
    - `cachePageGeometry(documentId, page, geo)` - was `cachePageGeometry(page, geo)`
    - `setSelection(documentId, selection)` - was `setSelection(selection)`
    - `startSelection(documentId)` - was `startSelection()` (no params)
    - `endSelection(documentId)` - was `endSelection()` (no params)
    - `clearSelection(documentId)` - was `clearSelection()` (no params)
    - `setRects(documentId, rects)` - was `setRects(rects)`
    - `setSlices(documentId, slices)` - was `setSlices(slices)`
  - **State Structure**: Plugin state now uses `documents: Record<string, SelectionDocumentState>` to track per-document selection state including cached page geometry, selection ranges, rects, and slices.
  - **Action Creators**: All action creators now require `documentId`.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **SelectionLayer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-selection/react`, Svelte: `@embedpdf/plugin-selection/svelte`, Vue: `@embedpdf/plugin-selection/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Added optional `rotation` prop - if not provided, uses document state rotation
    - Added optional `selectionMenu` prop for custom selection menu rendering
    - Component subscribes to document-specific selection state and menu placement
  - **CopyToClipboard Component**:
    - Updated to handle document-scoped copy events with `{ text }` payload format

  ### New Features
  - Per-document text selection tracking
  - Per-document page geometry caching
  - Per-document selection rects and slices
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `CopyToClipboard.svelte` and `SelectionLayer.svelte` components to correctly access plugin/capability instances from refactored hooks.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useSelectionPlugin`, `useSelectionCapability`), `SelectionLayer.svelte` component, and `CopyToClipboard.svelte` utility.

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

### Patch Changes

- [`50e051b`](https://github.com/embedpdf/embed-pdf-viewer/commit/50e051b1b3a49098d69ea36b1a848658909e7830) by [@bobsingor](https://github.com/bobsingor) – Add missing clear selection

## 1.1.0

### Minor Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Break out imperative selection APIs from **capability** to **plugin**, and slim the capability surface.
  - **Removed from `SelectionCapability`:**
    - `getGeometry(page)`
    - `begin(page, glyphIdx)`
    - `update(page, glyphIdx)`
    - `end()`
    - `clear()`
    - `registerSelectionOnPage(opts)`
  - Components/hooks now use the **plugin instance** for page-level registration:
    - React: `useSelectionPlugin().plugin.registerSelectionOnPage(...)`
    - Vue: `useSelectionPlugin().plugin.registerSelectionOnPage(...)`
  - Capability still provides read/query and events:
    - `getFormattedSelection`, `getFormattedSelectionForPage`
    - `getHighlightRects`, `getHighlightRectsForPage`
    - `getBoundingRects`, `getBoundingRectForPage`
    - `getSelectedText`, `copyToClipboard`
    - `onSelectionChange`, `onTextRetrieved`, `onCopyToClipboard`
    - enable/disable per mode + `getState()`

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Ability to refresh a page and cause rerender (necessary for redaction)

## 1.0.17

## 1.0.16

### Patch Changes

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Change to activeDefaultMode instead of active('default')

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add vue layer to the selection plugin

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update selection plugin to have shared code between react and preact to simplify workflow

## 1.0.11

### Patch Changes

- [`c632b8b`](https://github.com/embedpdf/embed-pdf-viewer/commit/c632b8ba482057e3034bd4d7e01e067f3107b642) by [@bobsingor](https://github.com/bobsingor) – Fix issue with text selection not working properly

## 1.0.10

### Patch Changes

- [`f629db4`](https://github.com/embedpdf/embed-pdf-viewer/commit/f629db47e1a2693e913defbc1a9e76912af945e3) by [@bobsingor](https://github.com/bobsingor) – Some small bugfixes, in some cases interactionmanager state can be null and gives error on fast reload, add get state to selection manager for debugging purposes and make @embedpdf/model a dependency of scroll to make sure it doesn't get add inline inside the component

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Improvements on text markup annotations (proper AP stream generation) and support for ink annotation

## 1.0.7

### Patch Changes

- [#31](https://github.com/embedpdf/embed-pdf-viewer/pull/31) by [@bobsingor](https://github.com/bobsingor) – Make copy to clipboard work

- [#35](https://github.com/embedpdf/embed-pdf-viewer/pull/35) by [@bobsingor](https://github.com/bobsingor) – Add new on handlerActiveEnd and handlerActiveStart

## 1.0.6

### Patch Changes

- [#29](https://github.com/embedpdf/embed-pdf-viewer/pull/29) by [@bobsingor](https://github.com/bobsingor) – Improve text selection and add ability to get text for a specific selection

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
