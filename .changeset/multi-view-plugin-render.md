---
'@embedpdf/plugin-render': major
---

## Multi-Document Support

The render plugin now supports rendering pages from multiple documents.

### Breaking Changes

- **Constructor**: Plugin constructor now accepts optional `config` parameter. Configuration is applied during construction instead of via `initialize()` method.

- **Removed `onRefreshPages`**: The `onRefreshPages()` method has been removed. Page refresh tracking is now handled in core `DocumentState.pageRefreshVersions`, allowing any plugin to observe page refreshes.

- **Render Methods**: `renderPage()` and `renderPageRect()` now accept an optional `documentId` parameter. If not provided, they operate on the active document.

- **Error Messages**: Error messages now include document ID for better debugging.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **RenderLayer Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-render/react`, Svelte: `@embedpdf/plugin-render/svelte`, Vue: `@embedpdf/plugin-render/vue`)
  - `scale` prop is now optional - if not provided, uses document state scale
  - Removed deprecated `scaleFactor` prop
  - `dpr` prop is now optional - if not provided, uses `window.devicePixelRatio`
  - Component now uses `useDocumentState` hook to get document scale and refresh version automatically

### New Features

- `forDocument(documentId)` method returns `RenderScope` for document-specific rendering operations
- Support for rendering pages from any document, not just the active one
- Simplified architecture with refresh tracking moved to core state
