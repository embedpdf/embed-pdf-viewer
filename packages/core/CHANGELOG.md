# @embedpdf/core

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

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

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update Svelte hooks (`useCapability`, `useCoreState`, `usePlugin`) to return reactive `$state` objects instead of computed getters for better integration with Svelte 5's reactivity model.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useRegistry`, `usePlugin`, `useCapability`, `useCoreState`) and components (`EmbedPDF`, `AutoMount`, `NestedWrapper`). Enhanced core `Store` to prevent dispatches within reducers. Thanks to @andrewrisse for the Svelte integration work!

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

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Refactored action dispatch handling in `BasePlugin`:
  - Renamed `debouncedDispatch` to **`cooldownDispatch`**, which now executes immediately if the cooldown has expired and blocks rapid repeated calls.
  - Introduced a new **`debouncedDispatch`** method that provides true debouncing: waits until no calls occur for the specified time before dispatching.
  - Added **`cancelDebouncedDispatch`** to cancel pending debounced actions.
  - Added internal `debouncedTimeouts` tracking and ensured all timeouts are cleared on `destroy`.

  This improves clarity and provides both cooldown and debounce semantics for action dispatching.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add support for automount of wrapper and utility component (this will make the developer experience easier)

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add utility and wrapper automount components

## 1.0.20

## 1.0.19

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

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update core to have shared code between react and preact to simplify workflow

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add support for vue for the @embedpdf/core package

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

### Patch Changes

- [`0e8f5d1`](https://github.com/embedpdf/embed-pdf-viewer/commit/0e8f5d1da3a331d00e1310d9f4249028f2d731b9) by [@bobsingor](https://github.com/bobsingor) – Make onInitialized function optional on the EmbedPDF component

## 1.0.4

### Patch Changes

- [#24](https://github.com/embedpdf/embed-pdf-viewer/pull/24) by [@bobsingor](https://github.com/bobsingor) – Move PDF engine hook to the engine package for consistency

- [`90bd467`](https://github.com/embedpdf/embed-pdf-viewer/commit/90bd46772b83b9b87b5c5886646193f308e7fdad) by [@bobsingor](https://github.com/bobsingor) – Add usePdfWorkerEngine to make engine initialization more straightforward

## 1.0.3

## 1.0.2

### Patch Changes

- [#18](https://github.com/embedpdf/embed-pdf-viewer/pull/18) by [@bobsingor](https://github.com/bobsingor) – Add missing react package for MUI example to work

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
