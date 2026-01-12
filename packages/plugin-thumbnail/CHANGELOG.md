# @embedpdf/plugin-thumbnail

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The thumbnail plugin now supports per-document thumbnail window state and viewport metrics.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setWindowState(documentId, window)` - Sets thumbnail window state for a document
    - `updateViewportMetrics(documentId, scrollY, viewportH)` - Updates viewport metrics for a document
  - **State Structure**: Plugin state now uses `documents: Record<string, ThumbnailDocumentState>` to track per-document thumbnail state including window state and viewport metrics.
  - **Action Creators**: All action creators now require `documentId`:
    - `initThumbnailState(documentId, state)`
    - `setWindowState(documentId, window)`
    - `updateViewportMetrics(documentId, scrollY, viewportH)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **ThumbImg Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-thumbnail/react`, Svelte: `@embedpdf/plugin-thumbnail/svelte`, Vue: `@embedpdf/plugin-thumbnail/vue`)
    - Component now uses `forDocument(documentId)` to get document-scoped thumbnail capability
    - Subscribes to document-specific page refresh events

  ### New Features
  - Per-document thumbnail window state tracking
  - Per-document viewport metrics for thumbnail positioning
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The thumbnail plugin now supports per-document thumbnail window state and viewport metrics.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setWindowState(documentId, window)` - Sets thumbnail window state for a document
    - `updateViewportMetrics(documentId, scrollY, viewportH)` - Updates viewport metrics for a document
  - **State Structure**: Plugin state now uses `documents: Record<string, ThumbnailDocumentState>` to track per-document thumbnail state including window state and viewport metrics.
  - **Action Creators**: All action creators now require `documentId`:
    - `initThumbnailState(documentId, state)`
    - `setWindowState(documentId, window)`
    - `updateViewportMetrics(documentId, scrollY, viewportH)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **ThumbImg Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-thumbnail/react`, Svelte: `@embedpdf/plugin-thumbnail/svelte`, Vue: `@embedpdf/plugin-thumbnail/vue`)
    - Component now uses `forDocument(documentId)` to get document-scoped thumbnail capability
    - Subscribes to document-specific page refresh events

  ### New Features
  - Per-document thumbnail window state tracking
  - Per-document viewport metrics for thumbnail positioning
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `ThumbImg.svelte` and `ThumbnailsPane.svelte` components to correctly access plugin/capability instances from refactored hooks.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useThumbnailPlugin`, `useThumbnailCapability`) and components (`ThumbnailsPane.svelte`, `ThumbImg.svelte`).

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

### Patch Changes

- [#189](https://github.com/embedpdf/embed-pdf-viewer/pull/189) by [@bobsingor](https://github.com/bobsingor) – Fix bug Cannot read properties of null (reading 'totalHeight') on thumbnails

## 1.3.5

### Patch Changes

- [#187](https://github.com/embedpdf/embed-pdf-viewer/pull/187) by [@bobsingor](https://github.com/bobsingor) – Fix bug that prevents from scrolling down in the thumbnail container

- [#187](https://github.com/embedpdf/embed-pdf-viewer/pull/187) by [@bobsingor](https://github.com/bobsingor) – Add Vue framework layer for thumbnail plugin

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

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Ability to refresh a page and cause rerender (necessary for redaction)

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update thumbnail plugin to have shared code between react and preact to simplify workflow

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
