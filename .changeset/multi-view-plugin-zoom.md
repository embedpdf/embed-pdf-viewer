---
'@embedpdf/plugin-zoom': major
---

## Multi-Document Support

The zoom plugin now supports per-document zoom levels and marquee zoom state.

### Breaking Changes

- **Actions**: All actions now require `documentId`:
  - `setZoomLevel(documentId, zoomLevel, currentZoomLevel)` - was `setZoomLevel(zoomLevel, currentZoomLevel)`
  - Removed `setInitialZoomLevel` action

- **State Structure**: Plugin state now uses `documents: Record<string, ZoomDocumentState>` to track per-document zoom levels and marquee zoom state.

- **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **MarqueeZoom Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-zoom/react`, Svelte: `@embedpdf/plugin-zoom/svelte`, Vue: `@embedpdf/plugin-zoom/vue`)
  - `scale` prop is now optional - if not provided, uses document state scale
  - Component now uses `useDocumentState` hook to get document scale automatically

- **PinchWrapper Component**:
  - Now requires `documentId` prop
  - Uses document-scoped zoom operations

### New Features

- Per-document zoom level tracking
- Per-document marquee zoom state
- `forDocument()` method for document-scoped operations
- Document lifecycle management with automatic state initialization and cleanup
