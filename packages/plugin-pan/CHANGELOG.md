# @embedpdf/plugin-pan

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The pan plugin now supports per-document pan mode state.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setPanMode(documentId, isPanMode)` - was `setPanMode(isPanMode)`
  - **State Structure**: Plugin state now uses `documents: Record<string, PanDocumentState>` to track per-document pan mode.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **usePan Hook**:
    - Now requires `documentId` parameter: `usePan(documentId)` (React/Preact: `@embedpdf/plugin-pan/react`, Svelte: `@embedpdf/plugin-pan/svelte`, Vue: `@embedpdf/plugin-pan/vue`)
    - Returns document-scoped pan capability via `forDocument()`
    - Subscribes to document-specific pan mode changes

  ### New Features
  - Per-document pan mode tracking
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The pan plugin now supports per-document pan mode state.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setPanMode(documentId, isPanMode)` - was `setPanMode(isPanMode)`
  - **State Structure**: Plugin state now uses `documents: Record<string, PanDocumentState>` to track per-document pan mode.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **usePan Hook**:
    - Now requires `documentId` parameter: `usePan(documentId)` (React/Preact: `@embedpdf/plugin-pan/react`, Svelte: `@embedpdf/plugin-pan/svelte`, Vue: `@embedpdf/plugin-pan/vue`)
    - Returns document-scoped pan capability via `forDocument()`
    - Subscribes to document-specific pan mode changes

  ### New Features
  - Per-document pan mode tracking
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `usePan` hook to return a reactive state object, aligning with the core hook refactoring.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`usePan`, etc.) and `PanMode.svelte` utility component.

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

## 1.0.18

## 1.0.17

## 1.0.16

### Patch Changes

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Change to activeDefaultMode instead of active('default')

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Add different pan modes (always, mobile, never)

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update pan plugin to have shared code between react and preact to simplify workflow

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

### Patch Changes

- [#18](https://github.com/embedpdf/embed-pdf-viewer/pull/18) by [@bobsingor](https://github.com/bobsingor) – Add missing react package for MUI example to work

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
