---
'@embedpdf/plugin-search': major
---

## Multi-Document Support

The search plugin now supports per-document search sessions, results, and state.

### Breaking Changes

- **All Actions**: Now require `documentId` parameter:
  - `startSearchSession(documentId)` - was `startSearchSession()` (no params)
  - `stopSearchSession(documentId)` - was `stopSearchSession()` (no params)
  - `setSearchFlags(documentId, flags)` - was `setSearchFlags(flags)`
  - `setShowAllResults(documentId, showAll)` - was `setShowAllResults(showAll)`
  - `startSearch(documentId, query)` - was `startSearch(query)`
  - `setSearchResults(documentId, results, total, activeResultIndex)` - was `setSearchResults(results, total, activeResultIndex)`
  - `appendSearchResults(documentId, results)` - was `appendSearchResults(results)`
  - `setActiveResultIndex(documentId, index)` - was `setActiveResultIndex(index)`

- **State Structure**: Plugin state now uses `documents: Record<string, SearchDocumentState>` to track per-document search state including active session, query, results, and flags.

- **Capability Methods**: All search operations now require document scoping or operate on the active document.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **SearchLayer Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-search/react`, Svelte: `@embedpdf/plugin-search/svelte`, Vue: `@embedpdf/plugin-search/vue`)
  - `scale` prop is now optional - if not provided, uses document state scale
  - Component now uses `forDocument(documentId)` to get document-scoped search capability
  - Component subscribes to document-specific search state changes

- **Search Hooks**:
  - All hooks now work with document-scoped capabilities via `forDocument()`
  - Components automatically scope operations to the provided `documentId`

### New Features

- Per-document search sessions (each document can have its own active search)
- Per-document search results and state
- `forDocument()` method for document-scoped search operations
- Document lifecycle management with automatic state initialization and cleanup
