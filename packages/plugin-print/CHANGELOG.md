# @embedpdf/plugin-print

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add permission checking for print operations:
  - Check `PdfPermissionFlag.Print` before allowing document printing
  - Return `PdfErrorCode.Security` error when print permission is denied

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The print plugin now supports printing from multiple documents.

  ### Breaking Changes
  - **Methods**: `print()` now accepts an optional `documentId` parameter and operates on the active document by default.
  - **Events**: `PrintReadyEvent` now includes `documentId` field for document context.
  - **Capability**: Added `forDocument(documentId)` method that returns `PrintScope` for document-specific operations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **usePrint Hook**:
    - Now requires `documentId` parameter: `usePrint(documentId)` (React/Preact: `@embedpdf/plugin-print/react`, Svelte: `@embedpdf/plugin-print/svelte`, Vue: `@embedpdf/plugin-print/vue`)
    - Returns document-scoped print capability via `forDocument()`

  ### New Features
  - `PrintScope` interface for document-scoped print operations
  - Support for printing any document, not just the active one
  - Document-aware print ready events

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The print plugin now supports printing from multiple documents.

  ### Breaking Changes
  - **Methods**: `print()` now accepts an optional `documentId` parameter and operates on the active document by default.
  - **Events**: `PrintReadyEvent` now includes `documentId` field for document context.
  - **Capability**: Added `forDocument(documentId)` method that returns `PrintScope` for document-specific operations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **usePrint Hook**:
    - Now requires `documentId` parameter: `usePrint(documentId)` (React/Preact: `@embedpdf/plugin-print/react`, Svelte: `@embedpdf/plugin-print/svelte`, Vue: `@embedpdf/plugin-print/vue`)
    - Returns document-scoped print capability via `forDocument()`

  ### New Features
  - `PrintScope` interface for document-scoped print operations
  - Support for printing any document, not just the active one
  - Document-aware print ready events

## 1.5.0

## 1.4.1

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`usePrintPlugin`, `usePrintCapability`) and `PrintFrame.svelte` utility component.

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

### Patch Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Improved `PrintPlugin` flexibility:
  - `print` method now accepts **optional** `PdfPrintOptions`. If none are provided, it falls back to default options.
  - Updated `PrintCapability` type accordingly (`print(options?: PdfPrintOptions)`).
  - Removed the hard requirement on `"render"` from the plugin manifest, simplifying dependency setup.

  This makes the print plugin easier to use in scenarios where no explicit options are needed.

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

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update print plugin to have shared code between react and preact to simplify workflow

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
