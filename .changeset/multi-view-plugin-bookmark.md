---
'@embedpdf/plugin-bookmark': major
---

## Multi-Document Support

The bookmark plugin now supports accessing bookmarks from multiple documents.

### Breaking Changes

- **Methods**: `getBookmarks()` now accepts an optional `documentId` parameter and operates on the active document by default.

- **Capability**: Added `forDocument(documentId)` method that returns `BookmarkScope` for document-specific operations.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Hooks**:
  - Added Svelte hooks support (`@embedpdf/plugin-bookmark/svelte`)
  - All hooks work with document-scoped capabilities via `forDocument()`

### New Features

- `BookmarkScope` interface for document-scoped bookmark operations
- Support for accessing bookmarks from any document, not just the active one
