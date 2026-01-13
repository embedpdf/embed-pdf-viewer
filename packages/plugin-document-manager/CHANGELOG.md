# @embedpdf/plugin-document-manager

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add per-document permission overrides when opening documents:
  - Add `permissions` option to `LoadDocumentUrlOptions` for URL-based document loading
  - Add `permissions` option to `LoadDocumentBufferOptions` for buffer-based document loading
  - Add `permissions` option to `OpenFileDialogOptions` for file dialog document loading
  - Pass permission configuration to core store when documents are opened

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

### Patch Changes

- [#305](https://github.com/embedpdf/embed-pdf-viewer/pull/305) by [@bobsingor](https://github.com/bobsingor) – Fixed document name extraction to always include `.pdf` extension when extracting filename from URL.

- [#305](https://github.com/embedpdf/embed-pdf-viewer/pull/305) by [@bobsingor](https://github.com/bobsingor) – Added optional `name` property to `LoadDocumentUrlOptions` to allow specifying a custom document name. When not provided, the name is extracted from the URL. If extraction fails, `undefined` is returned to allow downstream handling of default names.

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The document manager plugin is the core orchestrator for multi-document functionality, managing document lifecycle, loading, and active document tracking.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support multiple documents. The plugin now manages a collection of documents instead of a single document.
  - **Document Loading**: All document loading methods now return document IDs and support concurrent document loading:
    - `openDocumentUrl(options)` - Returns `Task<OpenDocumentResponse, PdfErrorReason>` with document ID
    - `openDocumentBuffer(options)` - Returns `Task<OpenDocumentResponse, PdfErrorReason>` with document ID
    - `openFileDialog(options)` - Returns `Task<OpenDocumentResponse, PdfErrorReason>` with document ID
  - **Document Management**:
    - `closeDocument(documentId)` - Now requires document ID (was `closeDocument()`)
    - Added `closeAllDocuments()` method
    - Added `setActiveDocument(documentId)` method
    - Added `moveDocument(documentId, newIndex)` method
    - Added `reorderDocuments(documentIds)` method
  - **State Access**:
    - `getActiveDocument()` - Returns active document or null
    - `getActiveDocumentId()` - Returns active document ID or null
    - `getDocument(documentId)` - Get specific document by ID
    - `getAllDocuments()` - Get all open documents
    - `isDocumentOpen(documentId)` - Check if document is open
  - **Events**: All events now include document IDs:
    - `onDocumentOpened` - Emits `DocumentState` with document ID
    - `onDocumentClosed` - Emits document ID string
    - `onActiveDocumentChanged` - Emits `DocumentChangeEvent` with previous and current document IDs
    - `onDocumentError` - Emits `DocumentErrorEvent` with document ID
    - `onDocumentOrderChanged` - Emits `DocumentOrderChangeEvent` with new order

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **DocumentContent Component**:
    - New component for rendering document content with state management (React/Preact: `@embedpdf/plugin-document-manager/react`, Svelte: `@embedpdf/plugin-document-manager/svelte`, Vue: `@embedpdf/plugin-document-manager/vue`)
    - Requires `documentId` prop
    - Provides render props with document state, loading, error, and loaded status
  - **DocumentContext Component**:
    - New component for managing multiple documents with tabs
    - Provides render props with all document states, active document ID, and tab actions (select, close, move)

  ### New Features
  - Support for opening and managing multiple PDF documents simultaneously
  - Document ordering and reordering
  - Per-document error handling and retry
  - Active document tracking and switching
  - Maximum document limit configuration (`maxDocuments` option)
  - Document lifecycle events for all document operations

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Fixed `useOpenDocuments` hook to correctly handle empty `documentIds` arrays. Previously, passing an empty array would fall through to returning all documents; now it correctly returns an empty array. This fix applies to React, Vue, and Svelte hooks.

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

### Patch Changes

- [`caec11d`](https://github.com/embedpdf/embed-pdf-viewer/commit/caec11d7e8b925e641b4834aadf9a126edfb3586) by [@bobsingor](https://github.com/bobsingor) – Fixed `useOpenDocuments` hook to correctly handle empty `documentIds` arrays. Previously, passing an empty array would fall through to returning all documents; now it correctly returns an empty array. This fix applies to React, Vue, and Svelte hooks.

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The document manager plugin is the core orchestrator for multi-document functionality, managing document lifecycle, loading, and active document tracking.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support multiple documents. The plugin now manages a collection of documents instead of a single document.
  - **Document Loading**: All document loading methods now return document IDs and support concurrent document loading:
    - `openDocumentUrl(options)` - Returns `Task<OpenDocumentResponse, PdfErrorReason>` with document ID
    - `openDocumentBuffer(options)` - Returns `Task<OpenDocumentResponse, PdfErrorReason>` with document ID
    - `openFileDialog(options)` - Returns `Task<OpenDocumentResponse, PdfErrorReason>` with document ID
  - **Document Management**:
    - `closeDocument(documentId)` - Now requires document ID (was `closeDocument()`)
    - Added `closeAllDocuments()` method
    - Added `setActiveDocument(documentId)` method
    - Added `moveDocument(documentId, newIndex)` method
    - Added `reorderDocuments(documentIds)` method
  - **State Access**:
    - `getActiveDocument()` - Returns active document or null
    - `getActiveDocumentId()` - Returns active document ID or null
    - `getDocument(documentId)` - Get specific document by ID
    - `getAllDocuments()` - Get all open documents
    - `isDocumentOpen(documentId)` - Check if document is open
  - **Events**: All events now include document IDs:
    - `onDocumentOpened` - Emits `DocumentState` with document ID
    - `onDocumentClosed` - Emits document ID string
    - `onActiveDocumentChanged` - Emits `DocumentChangeEvent` with previous and current document IDs
    - `onDocumentError` - Emits `DocumentErrorEvent` with document ID
    - `onDocumentOrderChanged` - Emits `DocumentOrderChangeEvent` with new order

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **DocumentContent Component**:
    - New component for rendering document content with state management (React/Preact: `@embedpdf/plugin-document-manager/react`, Svelte: `@embedpdf/plugin-document-manager/svelte`, Vue: `@embedpdf/plugin-document-manager/vue`)
    - Requires `documentId` prop
    - Provides render props with document state, loading, error, and loaded status
  - **DocumentContext Component**:
    - New component for managing multiple documents with tabs
    - Provides render props with all document states, active document ID, and tab actions (select, close, move)

  ### New Features
  - Support for opening and managing multiple PDF documents simultaneously
  - Document ordering and reordering
  - Per-document error handling and retry
  - Active document tracking and switching
  - Maximum document limit configuration (`maxDocuments` option)
  - Document lifecycle events for all document operations
