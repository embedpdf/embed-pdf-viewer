---
'@embedpdf/plugin-viewport': major
---

## Multi-Document Support

The viewport plugin now supports per-document viewport metrics, scroll state, and viewport registration.

### Breaking Changes

- **All Actions**: Now require `documentId` parameter:
  - `setViewportMetrics(documentId, metrics)` - was `setViewportMetrics(metrics)`
  - `setViewportScrollMetrics(documentId, scrollMetrics)` - was `setViewportScrollMetrics(scrollMetrics)`
  - `setViewportGap(documentId, gap)` - was `setViewportGap(gap)`
  - `setScrollActivity(documentId, isActive)` - was `setScrollActivity(isActive)`
  - `setSmoothScrollActivity(documentId, isActive)` - was `setSmoothScrollActivity(isActive)`

- **Viewport Registration**:
  - `registerViewport(documentId)` - Now requires document ID
  - `unregisterViewport(documentId)` - Now requires document ID

- **State Structure**: Plugin state now uses per-document viewport state tracking including metrics, scroll state, and viewport gates.

- **New Actions**: Added viewport gate management actions:
  - `addViewportGate(documentId, gateName)`
  - `removeViewportGate(documentId, gateName)`

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **Viewport Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-viewport/react`, Svelte: `@embedpdf/plugin-viewport/svelte`, Vue: `@embedpdf/plugin-viewport/vue`)
  - Component now uses `useViewportRef(documentId)` for document-scoped viewport reference
  - Uses `useIsViewportGated(documentId)` to check if viewport is gated
  - Children are only rendered when viewport is not gated

- **useViewportRef Hook**:
  - Now requires `documentId` parameter: `useViewportRef(documentId)`
  - Returns document-scoped viewport reference

### New Features

- Per-document viewport metrics and scroll tracking
- Per-document viewport registration
- Viewport gate management for coordinating viewport operations
- Document lifecycle management with automatic state initialization and cleanup
