---
'@embedpdf/plugin-redaction': major
---

## Multi-Document Support

The redaction plugin now supports per-document redaction state and operations.

### Breaking Changes

- **All Actions**: Now require `documentId` parameter:
  - `startRedaction(documentId, mode)` - was `startRedaction(mode)`
  - `endRedaction(documentId)` - was `endRedaction()` (no params)
  - `setActiveType(documentId, mode)` - was `setActiveType(mode)`
  - `addPending(documentId, items)` - was `addPending(items)`
  - `removePending(documentId, page, id)` - was `removePending(page, id)`
  - `clearPending(documentId)` - was `clearPending()` (no params)
  - `selectPending(documentId, page, id)` - was `selectPending(page, id)`
  - `deselectPending(documentId, page, id)` - was `deselectPending(page, id)`

- **State Structure**: Plugin state now uses `documents: Record<string, RedactionDocumentState>` to track per-document redaction state including active mode, pending items, and selections.

- **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **MarqueeRedact Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-redaction/react`, Svelte: `@embedpdf/plugin-redaction/svelte`, Vue: `@embedpdf/plugin-redaction/vue`)
  - `scale` prop is now optional - if not provided, uses document state scale
  - Component now uses `useDocumentState` hook to get document scale automatically

### New Features

- Per-document redaction mode and state tracking
- Per-document pending redaction items
- Per-document redaction selections
- `forDocument()` method for document-scoped operations
- Document lifecycle management with automatic state initialization and cleanup
