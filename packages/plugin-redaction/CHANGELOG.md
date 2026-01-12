# @embedpdf/plugin-redaction

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add permission checking for redaction operations:
  - Check `PdfPermissionFlag.ModifyContents` before adding pending redaction items
  - Check permission before enabling redact selection or marquee redact modes
  - Check permission before starting redaction mode
  - Check permission before committing pending redactions (single or all)
  - Return `PdfErrorCode.Security` error when permission is denied for commit operations

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The redaction plugin now supports per-document redaction state and operations.

  ### Breaking Changes
  - **All Actions**: Now require `documentId` parameter:
    - `startRedaction(documentId, mode)` - was `startRedaction(mode)`
    - `endRedaction(documentId)` - was `endRedaction()` (no params)
    - `setActiveType(documentId, mode)` - was `setActiveType(mode)`
    - `addPending(documentId, items)` - was `addPending(items)`
    - `removePending(documentId, page, id)` - was `removePending(page, id)`
    - `clearPending(documentId)` - was `clearPending()` (no params)
    - `selectPending(documentId, page, id)` - was `selectPending(page, id)`
    - `deselectPending(documentId, page, id)` - was `deselectPending(page, id)`
  - **State Structure**: Plugin state now uses `documents: Record<string, RedactionDocumentState>` to track per-document redaction state including active mode, pending items, and selections.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **MarqueeRedact Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-redaction/react`, Svelte: `@embedpdf/plugin-redaction/svelte`, Vue: `@embedpdf/plugin-redaction/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `useDocumentState` hook to get document scale automatically

  ### New Features
  - Per-document redaction mode and state tracking
  - Per-document pending redaction items
  - Per-document redaction selections
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The redaction plugin now supports per-document redaction state and operations.

  ### Breaking Changes
  - **All Actions**: Now require `documentId` parameter:
    - `startRedaction(documentId, mode)` - was `startRedaction(mode)`
    - `endRedaction(documentId)` - was `endRedaction()` (no params)
    - `setActiveType(documentId, mode)` - was `setActiveType(mode)`
    - `addPending(documentId, items)` - was `addPending(items)`
    - `removePending(documentId, page, id)` - was `removePending(page, id)`
    - `clearPending(documentId)` - was `clearPending()` (no params)
    - `selectPending(documentId, page, id)` - was `selectPending(page, id)`
    - `deselectPending(documentId, page, id)` - was `deselectPending(page, id)`
  - **State Structure**: Plugin state now uses `documents: Record<string, RedactionDocumentState>` to track per-document redaction state including active mode, pending items, and selections.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **MarqueeRedact Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-redaction/react`, Svelte: `@embedpdf/plugin-redaction/svelte`, Vue: `@embedpdf/plugin-redaction/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `useDocumentState` hook to get document scale automatically

  ### New Features
  - Per-document redaction mode and state tracking
  - Per-document pending redaction items
  - Per-document redaction selections
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

## 1.4.0

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

### Patch Changes

- [#204](https://github.com/embedpdf/embed-pdf-viewer/pull/204) by [@bobsingor](https://github.com/bobsingor) – Add Vue export to the redaction plugin package.json

- [#204](https://github.com/embedpdf/embed-pdf-viewer/pull/204) by [@bobsingor](https://github.com/bobsingor) – Add events function that get events on add, remove, clear, commit

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

## 1.1.0

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

### Patch Changes

- [#98](https://github.com/embedpdf/embed-pdf-viewer/pull/98) by [@bobsingor](https://github.com/bobsingor) – Move interaction manager handlers to the plugin for smaller and cleaner framework layers

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Support for redactions (properly redact, remove text objects, remove parts of images and paths)
