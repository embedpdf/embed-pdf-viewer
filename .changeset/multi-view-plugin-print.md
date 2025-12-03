---
'@embedpdf/plugin-print': major
---

## Multi-Document Support

The print plugin now supports printing from multiple documents.

### Breaking Changes

- **Methods**: `print()` now accepts an optional `documentId` parameter and operates on the active document by default.

- **Events**: `PrintReadyEvent` now includes `documentId` field for document context.

- **Capability**: Added `forDocument(documentId)` method that returns `PrintScope` for document-specific operations.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **usePrint Hook**:
  - Now requires `documentId` parameter: `usePrint(documentId)` (React/Preact: `@embedpdf/plugin-print/react`, Svelte: `@embedpdf/plugin-print/svelte`, Vue: `@embedpdf/plugin-print/vue`)
  - Returns document-scoped print capability via `forDocument()`

### New Features

- `PrintScope` interface for document-scoped print operations
- Support for printing any document, not just the active one
- Document-aware print ready events
