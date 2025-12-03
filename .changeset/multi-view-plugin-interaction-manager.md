---
'@embedpdf/plugin-interaction-manager': major
---

## Multi-Document Support

The interaction manager plugin now supports per-document interaction modes, cursors, and pause/resume state.

### Breaking Changes

- **All Per-Document Actions**: Now require `documentId` parameter:
  - `activateMode(documentId, mode)` - was `activateMode(mode)`
  - `pauseInteraction(documentId)` - was `pauseInteraction()` (no params)
  - `resumeInteraction(documentId)` - was `resumeInteraction()` (no params)
  - `setCursor(documentId, cursor)` - was `setCursor(cursor)`

- **Capability Methods**: All methods that previously operated on a single document now require document scoping:
  - `activate(mode)` → `forDocument(id).activate(mode)`
  - `getActiveMode()` → `forDocument(id).getActiveMode()`
  - `activateDefaultMode()` → `forDocument(id).activateDefaultMode()`
  - `pause()` → `forDocument(id).pause()`
  - `resume()` → `forDocument(id).resume()`
  - `getCursor()` → `forDocument(id).getCursor()`
  - `setCursor(cursor)` → `forDocument(id).setCursor(cursor)`

- **State Structure**: Plugin state now uses `documents: Record<string, InteractionDocumentState>` to track per-document interaction state (active mode, cursor, paused state).

- **Events**: `onModeChange` events now include `documentId` in the event payload.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **GlobalPointerProvider Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-interaction-manager/react`, Svelte: `@embedpdf/plugin-interaction-manager/svelte`, Vue: `@embedpdf/plugin-interaction-manager/vue`)
  - Uses document-scoped pointer provider configuration

- **PagePointerProvider Component**:
  - Now requires `documentId` prop
  - Uses `useDocumentState` to get document-specific state
  - Automatically gets page size and position from document state

### New Features

- `forDocument(documentId)` method returns `InteractionScope` for document-specific operations
- Per-document mode management (each document can have its own active interaction mode)
- Per-document cursor state
- Per-document pause/resume state
- Document lifecycle management with automatic state initialization and cleanup
