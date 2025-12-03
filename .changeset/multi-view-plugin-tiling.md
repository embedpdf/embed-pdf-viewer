---
'@embedpdf/plugin-tiling': major
---

## Multi-Document Support

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
