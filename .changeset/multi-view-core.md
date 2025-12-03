---
'@embedpdf/core': major
---

## Multi-Document Support

This is a major refactoring to support multiple documents in a single viewer instance. The core architecture has been significantly enhanced to manage per-document state and lifecycle.

### Breaking Changes

- **Store Structure**: Core state now uses `documents: Record<string, DocumentState>` instead of a single `document` property. Each document has its own state including pages, scale, rotation, and other document-specific properties.

- **BasePlugin Lifecycle**: Added new protected lifecycle methods that plugins can override:
  - `onDocumentLoadingStarted(documentId: string)` - Called when a document starts loading
  - `onDocumentLoaded(documentId: string)` - Called when a document finishes loading
  - `onDocumentClosed(documentId: string)` - Called when a document is closed
  - `onActiveDocumentChanged(previousId: string | null, currentId: string | null)` - Called when the active document changes
  - `onScaleChanged(documentId: string, scale: number)` - Called when document scale changes
  - `onRotationChanged(documentId: string, rotation: number)` - Called when document rotation changes

- **Document Access**: New helper methods in BasePlugin:
  - `getActiveDocumentId()` - Get the active document ID (throws if none)
  - `getActiveDocumentIdOrNull()` - Get the active document ID or null
  - `getCoreDocument(documentId?: string)` - Get document state by ID
  - `getCoreDocumentOrThrow(documentId?: string)` - Get document state or throw

- **Actions**: All core actions now support an optional `documentId` parameter. Actions that previously operated on a single document now require explicit document targeting.

- **State Management**: The store now tracks multiple documents with an `activeDocumentId` field to indicate which document is currently active.

### New Features

- Support for opening and managing multiple PDF documents simultaneously
- Per-document state isolation
- Document lifecycle management with proper cleanup
- Active document tracking and switching
