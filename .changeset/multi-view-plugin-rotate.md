---
'@embedpdf/plugin-rotate': major
---

## Multi-Document Support

The rotate plugin now supports per-document rotation state.

### Breaking Changes

- **Actions**: All actions now require `documentId`:
  - `setRotation(documentId, rotation)` - was `setRotation(rotation)`

- **State Structure**: Plugin state now uses `documents: Record<string, RotateDocumentState>` to track per-document rotation.

- **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Rotate Component**:
  - Now requires `documentId` and `pageIndex` props (React/Preact: `@embedpdf/plugin-rotate/react`, Svelte: `@embedpdf/plugin-rotate/svelte`, Vue: `@embedpdf/plugin-rotate/vue`)
  - Replaced `pageSize` prop with automatic page size detection from document state
  - `rotation` and `scale` props are now optional - if not provided, uses document state values
  - Component now uses `useDocumentState` hook to get document rotation and scale automatically

### New Features

- Per-document rotation tracking
- `forDocument()` method for document-scoped operations
- Document lifecycle management with automatic state initialization and cleanup
