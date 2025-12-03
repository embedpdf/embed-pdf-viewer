---
'@embedpdf/plugin-fullscreen': major
---

## Multi-Document Support

The fullscreen plugin now supports per-document fullscreen state and target element configuration.

### Breaking Changes

- **Constructor**: Plugin constructor now requires `config` parameter.

- **Methods**:
  - `enableFullscreen(targetElement?)` - Now accepts optional target element selector
  - `toggleFullscreen(targetElement?)` - Now accepts optional target element selector

- **Events**: `FullscreenRequestEvent` now includes `documentId` field for document context.

- **Configuration**: Added `getTargetSelector()` method to get the current target element selector (from last request or config default).

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **FullscreenProvider Component**:
  - Updated to handle document-scoped fullscreen requests (React/Preact: `@embedpdf/plugin-fullscreen/react`, Svelte: `@embedpdf/plugin-fullscreen/svelte`, Vue: `@embedpdf/plugin-fullscreen/vue`)
  - Now uses `getTargetSelector()` to determine target element for fullscreen
  - Uses new `handleFullscreenRequest` utility for proper target element handling

### New Features

- Per-document fullscreen state tracking
- Configurable target element for fullscreen operations
- Document-aware fullscreen request events
