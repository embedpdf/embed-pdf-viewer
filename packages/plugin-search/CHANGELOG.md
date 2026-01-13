# @embedpdf/plugin-search

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The search plugin now supports per-document search sessions, results, and state.

  ### Breaking Changes
  - **All Actions**: Now require `documentId` parameter:
    - `startSearchSession(documentId)` - was `startSearchSession()` (no params)
    - `stopSearchSession(documentId)` - was `stopSearchSession()` (no params)
    - `setSearchFlags(documentId, flags)` - was `setSearchFlags(flags)`
    - `setShowAllResults(documentId, showAll)` - was `setShowAllResults(showAll)`
    - `startSearch(documentId, query)` - was `startSearch(query)`
    - `setSearchResults(documentId, results, total, activeResultIndex)` - was `setSearchResults(results, total, activeResultIndex)`
    - `appendSearchResults(documentId, results)` - was `appendSearchResults(results)`
    - `setActiveResultIndex(documentId, index)` - was `setActiveResultIndex(index)`
  - **State Structure**: Plugin state now uses `documents: Record<string, SearchDocumentState>` to track per-document search state including active session, query, results, and flags.
  - **Capability Methods**: All search operations now require document scoping or operate on the active document.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **SearchLayer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-search/react`, Svelte: `@embedpdf/plugin-search/svelte`, Vue: `@embedpdf/plugin-search/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `forDocument(documentId)` to get document-scoped search capability
    - Component subscribes to document-specific search state changes
  - **Search Hooks**:
    - All hooks now work with document-scoped capabilities via `forDocument()`
    - Components automatically scope operations to the provided `documentId`

  ### New Features
  - Per-document search sessions (each document can have its own active search)
  - Per-document search results and state
  - `forDocument()` method for document-scoped search operations
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The search plugin now supports per-document search sessions, results, and state.

  ### Breaking Changes
  - **All Actions**: Now require `documentId` parameter:
    - `startSearchSession(documentId)` - was `startSearchSession()` (no params)
    - `stopSearchSession(documentId)` - was `stopSearchSession()` (no params)
    - `setSearchFlags(documentId, flags)` - was `setSearchFlags(flags)`
    - `setShowAllResults(documentId, showAll)` - was `setShowAllResults(showAll)`
    - `startSearch(documentId, query)` - was `startSearch(query)`
    - `setSearchResults(documentId, results, total, activeResultIndex)` - was `setSearchResults(results, total, activeResultIndex)`
    - `appendSearchResults(documentId, results)` - was `appendSearchResults(results)`
    - `setActiveResultIndex(documentId, index)` - was `setActiveResultIndex(index)`
  - **State Structure**: Plugin state now uses `documents: Record<string, SearchDocumentState>` to track per-document search state including active session, query, results, and flags.
  - **Capability Methods**: All search operations now require document scoping or operate on the active document.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **SearchLayer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-search/react`, Svelte: `@embedpdf/plugin-search/svelte`, Vue: `@embedpdf/plugin-search/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `forDocument(documentId)` to get document-scoped search capability
    - Component subscribes to document-specific search state changes
  - **Search Hooks**:
    - All hooks now work with document-scoped capabilities via `forDocument()`
    - Components automatically scope operations to the provided `documentId`

  ### New Features
  - Per-document search sessions (each document can have its own active search)
  - Per-document search results and state
  - `forDocument()` method for document-scoped search operations
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `SearchLayer.svelte` component and `useSearch` hook to use refactored core hooks and return a reactive state object.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useSearch`, etc.) and `SearchLayer.svelte` component. Fixed initial state in shared hook.

## 1.3.16

## 1.3.15

### Patch Changes

- [#218](https://github.com/embedpdf/embed-pdf-viewer/pull/218) by [@odedindi](https://github.com/odedindi) – Use unique key prop in search layer component results mapping

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

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Ability to stream search results for better experience on large documents

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update search plugin to have shared code between react and preact to simplify workflow

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
