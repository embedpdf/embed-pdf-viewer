# @embedpdf/plugin-redaction

## 2.6.3

## 2.6.2

## 2.6.1

## 2.6.0

### Minor Changes

- [#447](https://github.com/embedpdf/embed-pdf-viewer/pull/447) by [@bobsingor](https://github.com/bobsingor) – Subscribe to selection plugin's `onEmptySpaceClick` event to deselect pending redactions when the user clicks on empty page space. Restores background-click-to-deselect behavior that was lost during the marquee unification.

- [#447](https://github.com/embedpdf/embed-pdf-viewer/pull/447) by [@bobsingor](https://github.com/bobsingor) – Unified marquee redaction with the selection plugin's marquee infrastructure. Removed standalone `createMarqueeHandler`, `registerMarqueeOnPage`, `RegisterMarqueeOnPageOptions`, and `MarqueeRedactCallback`. Marquee redaction now subscribes to selection plugin's `onMarqueeChange` and `onMarqueeEnd` events and forwards them via new `onRedactionMarqueeChange` method. Enabled marquee for `RedactionMode.Redact` and `RedactionMode.MarqueeRedact` modes via `enableForMode`. Added page activity claims (`redaction-selection` topic) in legacy mode for scroll plugin page elevation.

### Patch Changes

- [#459](https://github.com/embedpdf/embed-pdf-viewer/pull/459) by [@bobsingor](https://github.com/bobsingor) – Fix default redaction fill color (`color`) to `#000000` (black) and overlay text color (`overlayColor`) to `#FFFFFF` (white).

- [#458](https://github.com/embedpdf/embed-pdf-viewer/pull/458) by [@bobsingor](https://github.com/bobsingor) –
  - Use `standardFontCssProperties` in redaction overlay components (React, Svelte, Vue) for consistent font rendering.

- [#452](https://github.com/embedpdf/embed-pdf-viewer/pull/452) by [@bobsingor](https://github.com/bobsingor) –
  - Explicitly disable rotation for redaction tools.

## 2.5.0

### Patch Changes

- [#441](https://github.com/embedpdf/embed-pdf-viewer/pull/441) by [@bobsingor](https://github.com/bobsingor) – Fixed rotation calculation in RedactionLayer components to properly combine page intrinsic rotation with document rotation:
  - Updated React `RedactionLayer` component to compute effective rotation as `(pageRotation + docRotation) % 4`
  - Updated Vue `redaction-layer.vue` component with the same rotation logic
  - Updated Svelte `redaction-layer.svelte` component with the same rotation logic

## 2.4.1

## 2.4.0

### Minor Changes

- [#426](https://github.com/embedpdf/embed-pdf-viewer/pull/426) by [@bobsingor](https://github.com/bobsingor) – Added annotation-based redaction mode for integrated redaction workflow:
  - Added `useAnnotationMode` config option to use REDACT annotations as pending redactions
  - Added unified `RedactionMode.Redact` mode supporting both text selection and area marquee
  - Added `redactTool` annotation tool for integration with annotation plugin
  - Added `RedactHighlight` and `RedactArea` components for rendering redact annotations
  - Added automatic renderer registration via framework-specific `RedactionPluginPackage`
  - Added `source`, `markColor`, `redactionColor`, and `text` properties to `RedactionItem` type
  - Pending redactions now sync with annotation plugin state in annotation mode
  - Added `enableRedact()`, `toggleRedact()`, `isRedactActive()`, `endRedact()` methods
  - Removed deprecated `startRedaction()` and `endRedaction()` methods from scope API

## 2.3.0

### Patch Changes

- [#406](https://github.com/embedpdf/embed-pdf-viewer/pull/406) by [@bobsingor](https://github.com/bobsingor) – Updated to use the new `enableForMode` signature with options object. Configured redaction mode to suppress selection layer rects since the redaction plugin renders its own selection visualization.

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
