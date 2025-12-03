---
'@embedpdf/plugin-selection': major
---

## Multi-Document Support

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
