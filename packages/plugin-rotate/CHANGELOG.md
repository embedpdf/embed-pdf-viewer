# @embedpdf/plugin-rotate

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The rotate plugin now supports per-document rotation state.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setRotation(documentId, rotation)` - was `setRotation(rotation)`
  - **State Structure**: Plugin state now uses `documents: Record<string, RotateDocumentState>` to track per-document rotation.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Rotate Component**:
    - Now requires `documentId` and `pageIndex` props (React/Preact: `@embedpdf/plugin-rotate/react`, Svelte: `@embedpdf/plugin-rotate/svelte`, Vue: `@embedpdf/plugin-rotate/vue`)
    - Replaced `pageSize` prop with automatic page size detection from document state
    - `rotation` and `scale` props are now optional - if not provided, uses document state values
    - Component now uses `useDocumentState` hook to get document rotation and scale automatically

  ### New Features
  - Per-document rotation tracking
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The rotate plugin now supports per-document rotation state.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setRotation(documentId, rotation)` - was `setRotation(rotation)`
  - **State Structure**: Plugin state now uses `documents: Record<string, RotateDocumentState>` to track per-document rotation.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Rotate Component**:
    - Now requires `documentId` and `pageIndex` props (React/Preact: `@embedpdf/plugin-rotate/react`, Svelte: `@embedpdf/plugin-rotate/svelte`, Vue: `@embedpdf/plugin-rotate/vue`)
    - Replaced `pageSize` prop with automatic page size detection from document state
    - `rotation` and `scale` props are now optional - if not provided, uses document state values
    - Component now uses `useDocumentState` hook to get document rotation and scale automatically

  ### New Features
  - Per-document rotation tracking
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `Rotate.svelte` component and `useRotate` hook to work with the refactored Svelte core hooks and return a reactive state object.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useRotate`, etc.) and `Rotate.svelte` component.

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

### Minor Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Refactored rotate plugin API and utilities:
  - Moved `getNextRotation`, `getPreviousRotation`, and rotation matrix helpers into `utils`.
  - Split matrix helpers into:
    - **`getRotationMatrix`** → returns the numeric 6-tuple.
    - **`getRotationMatrixString`** → returns a CSS `matrix(...)` string.
  - `RotateCapability.onRotateChange` is now typed as an **`EventHook<Rotation>`**.
  - Added **`getMatrixAsString`** method to `RotatePlugin` for CSS transforms.
  - Updated React (`Rotate` component + hook) and Vue (`rotate.vue` + hook) to use `useRotatePlugin` and the new API.
  - Added new `useRotate` hooks (React + Vue) for reactive rotation state.

  These changes make the rotate plugin API more consistent, typed, and ergonomic across frameworks.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

## 1.0.18

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update rotate plugin to have shared code between react and preact to simplify workflow

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add vue layer to the rotate plugin package

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
