---
'@embedpdf/plugin-spread': major
---

## Multi-Document Support

The spread plugin now supports per-document spread mode and page grouping.

### Breaking Changes

- **Actions**: All actions now require `documentId`:
  - `setSpreadMode(documentId, spreadMode)` - was `setSpreadMode(mode)`
  - Added `setPageGrouping(documentId, grouping)` action for custom page grouping

- **State Structure**: Plugin state now uses `documents: Record<string, SpreadDocumentState>` to track per-document spread mode and page grouping.

- **Action Creators**: All action creators now require `documentId`:
  - `initSpreadState(documentId, state)`
  - `setSpreadMode(documentId, spreadMode)`
  - `setPageGrouping(documentId, grouping)`

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **useSpread Hook**:
  - Now requires `documentId` parameter: `useSpread(documentId)` (React/Preact: `@embedpdf/plugin-spread/react`, Svelte: `@embedpdf/plugin-spread/svelte`, Vue: `@embedpdf/plugin-spread/vue`)
  - Returns document-scoped spread capability via `forDocument()`
  - Subscribes to document-specific spread mode changes

### New Features

- Per-document spread mode tracking
- Per-document page grouping configuration
- Document lifecycle management with automatic state initialization and cleanup
