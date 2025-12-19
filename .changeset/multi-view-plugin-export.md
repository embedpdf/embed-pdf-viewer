---
'@embedpdf/plugin-export': major
---

## Multi-Document Support

The export plugin now supports exporting multiple documents.

### Breaking Changes

- **Methods**: All methods now accept an optional `documentId` parameter:
  - `saveAsCopy(documentId?)` - Saves a copy of the specified or active document
  - `download(documentId?)` - Downloads the specified or active document

- **Events**: `DownloadRequestEvent` now includes `documentId` field. The `onRequest` event hook now receives events with document context.

- **Capability**: Added `forDocument(documentId)` method that returns `ExportScope` for document-specific operations.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Download Component**:
  - Updated to handle document-scoped export operations (React/Preact: `@embedpdf/plugin-export/react`, Svelte: `@embedpdf/plugin-export/svelte`, Vue: `@embedpdf/plugin-export/vue`)
  - Now uses `event.documentId` from download request events
  - Removed `fileName` prop - uses document name from export task

### New Features

- `ExportScope` interface for document-scoped export operations
- Support for exporting any document, not just the active one
- Document-aware download request events
