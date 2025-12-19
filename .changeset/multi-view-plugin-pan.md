---
'@embedpdf/plugin-pan': major
---

## Multi-Document Support

The pan plugin now supports per-document pan mode state.

### Breaking Changes

- **Actions**: All actions now require `documentId`:
  - `setPanMode(documentId, isPanMode)` - was `setPanMode(isPanMode)`

- **State Structure**: Plugin state now uses `documents: Record<string, PanDocumentState>` to track per-document pan mode.

- **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **usePan Hook**:
  - Now requires `documentId` parameter: `usePan(documentId)` (React/Preact: `@embedpdf/plugin-pan/react`, Svelte: `@embedpdf/plugin-pan/svelte`, Vue: `@embedpdf/plugin-pan/vue`)
  - Returns document-scoped pan capability via `forDocument()`
  - Subscribes to document-specific pan mode changes

### New Features

- Per-document pan mode tracking
- `forDocument()` method for document-scoped operations
- Document lifecycle management with automatic state initialization and cleanup
