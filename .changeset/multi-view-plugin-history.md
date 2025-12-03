---
'@embedpdf/plugin-history': major
---

## Multi-Document Support

The history plugin now supports per-document history state.

### Breaking Changes

- **Actions**:
  - Replaced `SET_HISTORY_STATE` with `SET_HISTORY_DOCUMENT_STATE` that requires `documentId`
  - Added document lifecycle actions: `INIT_HISTORY_STATE` and `CLEANUP_HISTORY_STATE`

- **State Structure**: Plugin state now uses `documents: Record<string, HistoryDocumentState>` to track per-document history state.

- **Action Creators**:
  - `setHistoryState(documentId, state)` - Now requires document ID
  - Added `initHistoryState(documentId)` and `cleanupHistoryState(documentId)`

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Hooks**:
  - Added Svelte hooks support (`@embedpdf/plugin-history/svelte`)
  - All hooks work with document-scoped capabilities

### New Features

- Per-document history state tracking
- Document lifecycle management with automatic state initialization and cleanup
