# @embedpdf/plugin-selection

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
