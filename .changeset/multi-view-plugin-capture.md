---
'@embedpdf/plugin-capture': major
---

## Multi-Document Support

The capture plugin now supports multiple documents with per-document state management.

### Breaking Changes

- **CaptureAreaEvent**: Now includes `documentId` field. All capture events are scoped to a specific document.

- **RegisterMarqueeOnPageOptions**: Now requires `documentId` field to specify which document the marquee capture should be registered for.

- **CaptureCapability**:
  - Removed `onMarqueeCaptureActiveChange` event hook
  - Added `onStateChange` event hook that emits `StateChangeEvent` with `documentId` and state
  - Added `getState()` method to get current document state
  - Added `forDocument(documentId: string)` method that returns a `CaptureScope` for document-specific operations

- **State Management**: Plugin now maintains per-document state with `CaptureDocumentState` tracking `isMarqueeCaptureActive` per document.

### Framework-Specific Changes (React/Preact, Svelte, Vue)

- **MarqueeCapture Component**:
  - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-capture/react`, Svelte: `@embedpdf/plugin-capture/svelte`, Vue: `@embedpdf/plugin-capture/vue`)
  - `scale` prop is now optional - if not provided, uses document state scale
  - Component now uses `useDocumentState` hook to get document scale automatically

- **useCapture Hook**:
  - Now requires `documentId` parameter: `useCapture(documentId)`
  - Returns document-scoped capture state and operations

### New Features

- `CaptureScope` interface for document-scoped operations
- Per-document marquee capture state tracking
- Document lifecycle management with automatic state initialization and cleanup
- `forDocument()` method for operating on specific documents
