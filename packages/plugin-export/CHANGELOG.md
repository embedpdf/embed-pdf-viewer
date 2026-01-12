# @embedpdf/plugin-export

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The export plugin now supports exporting multiple documents.

  ### Breaking Changes
  - **Methods**: All methods now accept an optional `documentId` parameter:
    - `saveAsCopy(documentId?)` - Saves a copy of the specified or active document
    - `download(documentId?)` - Downloads the specified or active document
  - **Events**: `DownloadRequestEvent` now includes `documentId` field. The `onRequest` event hook now receives events with document context.
  - **Capability**: Added `forDocument(documentId)` method that returns `ExportScope` for document-specific operations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Download Component**:
    - Updated to handle document-scoped export operations (React/Preact: `@embedpdf/plugin-export/react`, Svelte: `@embedpdf/plugin-export/svelte`, Vue: `@embedpdf/plugin-export/vue`)
    - Now uses `event.documentId` from download request events
    - Removed `fileName` prop - uses document name from export task

  ### New Features
  - `ExportScope` interface for document-scoped export operations
  - Support for exporting any document, not just the active one
  - Document-aware download request events

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The export plugin now supports exporting multiple documents.

  ### Breaking Changes
  - **Methods**: All methods now accept an optional `documentId` parameter:
    - `saveAsCopy(documentId?)` - Saves a copy of the specified or active document
    - `download(documentId?)` - Downloads the specified or active document
  - **Events**: `DownloadRequestEvent` now includes `documentId` field. The `onRequest` event hook now receives events with document context.
  - **Capability**: Added `forDocument(documentId)` method that returns `ExportScope` for document-specific operations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Download Component**:
    - Updated to handle document-scoped export operations (React/Preact: `@embedpdf/plugin-export/react`, Svelte: `@embedpdf/plugin-export/svelte`, Vue: `@embedpdf/plugin-export/vue`)
    - Now uses `event.documentId` from download request events
    - Removed `fileName` prop - uses document name from export task

  ### New Features
  - `ExportScope` interface for document-scoped export operations
  - Support for exporting any document, not just the active one
  - Document-aware download request events

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `Download.svelte` component to correctly access plugin and capability instances from the refactored hooks.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useExportPlugin`, `useExportCapability`) and `Download.svelte` utility component.

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

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

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add utility and wrapper automount components

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

### Patch Changes

- [#73](https://github.com/embedpdf/embed-pdf-viewer/pull/73) by [@lbhfuture](https://github.com/lbhfuture) – Add a prop to the Download component to update the filename

## 1.0.18

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update export plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
