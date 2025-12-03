---
'@embedpdf/plugin-thumbnail': major
---

## Multi-Document Support

The thumbnail plugin now supports per-document thumbnail window state and viewport metrics.

### Breaking Changes

- **Actions**: All actions now require `documentId`:
  - `setWindowState(documentId, window)` - Sets thumbnail window state for a document
  - `updateViewportMetrics(documentId, scrollY, viewportH)` - Updates viewport metrics for a document

- **State Structure**: Plugin state now uses `documents: Record<string, ThumbnailDocumentState>` to track per-document thumbnail state including window state and viewport metrics.

- **Action Creators**: All action creators now require `documentId`:
  - `initThumbnailState(documentId, state)`
  - `setWindowState(documentId, window)`
  - `updateViewportMetrics(documentId, scrollY, viewportH)`

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **ThumbImg Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-thumbnail/react`, Svelte: `@embedpdf/plugin-thumbnail/svelte`, Vue: `@embedpdf/plugin-thumbnail/vue`)
  - Component now uses `forDocument(documentId)` to get document-scoped thumbnail capability
  - Subscribes to document-specific page refresh events

### New Features

- Per-document thumbnail window state tracking
- Per-document viewport metrics for thumbnail positioning
- Document lifecycle management with automatic state initialization and cleanup
