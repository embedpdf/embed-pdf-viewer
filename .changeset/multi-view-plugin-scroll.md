---
'@embedpdf/plugin-scroll': major
---

## Multi-Document Support

The scroll plugin now supports per-document scroll state and strategies.

### Breaking Changes

- **Actions**: Complete action refactoring:
  - Replaced `UPDATE_SCROLL_STATE` with `UPDATE_DOCUMENT_SCROLL_STATE` that requires `documentId`
  - Replaced `SET_DESIRED_SCROLL_POSITION` and `UPDATE_TOTAL_PAGES` with document-scoped actions
  - Replaced `SET_PAGE_CHANGE_STATE` with document-scoped state management
  - Added `SET_SCROLL_STRATEGY` action for per-document scroll strategies

- **State Structure**: Plugin state now uses `documents: Record<string, ScrollDocumentState>` to track per-document scroll state including position, page change state, and scroll strategy.

- **Action Creators**: All action creators now require `documentId`:
  - `initScrollState(documentId, state)`
  - `updateDocumentScrollState(documentId, state)`
  - `setScrollStrategy(documentId, strategy)`

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Scroller Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-scroll/react`, Svelte: `@embedpdf/plugin-scroll/svelte`, Vue: `@embedpdf/plugin-scroll/vue`)
  - Removed `overlayElements` prop
  - `renderPage` prop now receives `PageLayout` instead of `RenderPageProps`
  - Component subscribes to document-specific scroller data

### New Features

- Per-document scroll state tracking
- Per-document scroll strategies
- Document lifecycle management with automatic state initialization and cleanup
