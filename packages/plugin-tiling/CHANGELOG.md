# @embedpdf/plugin-tiling

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The tiling plugin now supports per-document tile management and status tracking.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `updateVisibleTiles(documentId, tiles)` - was `updateVisibleTiles(tiles)`
    - `markTileStatus(documentId, pageIndex, tileId, status)` - was `markTileStatus(pageIndex, tileId, status)`
  - **State Structure**: Plugin state now uses `documents: Record<string, TilingDocumentState>` to track per-document tile state including visible tiles and tile statuses.
  - **Action Creators**: All action creators now require `documentId`:
    - `initTilingState(documentId, state)`
    - `updateVisibleTiles(documentId, tiles)`
    - `markTileStatus(documentId, pageIndex, tileId, status)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **TileImg Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-tiling/react`, Svelte: `@embedpdf/plugin-tiling/svelte`, Vue: `@embedpdf/plugin-tiling/vue`)
    - Component now uses `forDocument(documentId)` to get document-scoped tiling capability
    - Uses document-scoped tile rendering

  ### New Features
  - Per-document tile tracking and management
  - Per-document tile status tracking
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The tiling plugin now supports per-document tile management and status tracking.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `updateVisibleTiles(documentId, tiles)` - was `updateVisibleTiles(tiles)`
    - `markTileStatus(documentId, pageIndex, tileId, status)` - was `markTileStatus(pageIndex, tileId, status)`
  - **State Structure**: Plugin state now uses `documents: Record<string, TilingDocumentState>` to track per-document tile state including visible tiles and tile statuses.
  - **Action Creators**: All action creators now require `documentId`:
    - `initTilingState(documentId, state)`
    - `updateVisibleTiles(documentId, tiles)`
    - `markTileStatus(documentId, pageIndex, tileId, status)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **TileImg Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-tiling/react`, Svelte: `@embedpdf/plugin-tiling/svelte`, Vue: `@embedpdf/plugin-tiling/vue`)
    - Component now uses `forDocument(documentId)` to get document-scoped tiling capability
    - Uses document-scoped tile rendering

  ### New Features
  - Per-document tile tracking and management
  - Per-document tile status tracking
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `TileImg.svelte` and `TilingLayer.svelte` components to correctly access capability/core state instances from refactored hooks.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useTilingPlugin`, `useTilingCapability`) and components (`TilingLayer.svelte`, `TileImg.svelte`). Thanks to @andrewrisse for adding the Svelte components!

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

### Patch Changes

- [#209](https://github.com/embedpdf/embed-pdf-viewer/pull/209) by [@bobsingor](https://github.com/bobsingor) – Refactor tile refresh logic and cleanup tile image components

## 1.3.12

### Patch Changes

- [#204](https://github.com/embedpdf/embed-pdf-viewer/pull/204) by [@bobsingor](https://github.com/bobsingor) – Fix refresh not working on Vue component after redaction

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

## 1.1.0

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

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Ability to refresh a page and cause rerender (necessary for redaction)

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add vue layer to tiling plugin

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update tiling plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Make tiling work properly when page is rotated

## 1.0.7

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
