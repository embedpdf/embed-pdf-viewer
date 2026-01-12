# @embedpdf/plugin-bookmark

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The bookmark plugin now supports accessing bookmarks from multiple documents.

  ### Breaking Changes
  - **Methods**: `getBookmarks()` now accepts an optional `documentId` parameter and operates on the active document by default.
  - **Capability**: Added `forDocument(documentId)` method that returns `BookmarkScope` for document-specific operations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Hooks**:
    - Added Svelte hooks support (`@embedpdf/plugin-bookmark/svelte`)
    - All hooks work with document-scoped capabilities via `forDocument()`

  ### New Features
  - `BookmarkScope` interface for document-scoped bookmark operations
  - Support for accessing bookmarks from any document, not just the active one

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The bookmark plugin now supports accessing bookmarks from multiple documents.

  ### Breaking Changes
  - **Methods**: `getBookmarks()` now accepts an optional `documentId` parameter and operates on the active document by default.
  - **Capability**: Added `forDocument(documentId)` method that returns `BookmarkScope` for document-specific operations.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Hooks**:
    - Added Svelte hooks support (`@embedpdf/plugin-bookmark/svelte`)
    - All hooks work with document-scoped capabilities via `forDocument()`

  ### New Features
  - `BookmarkScope` interface for document-scoped bookmark operations
  - Support for accessing bookmarks from any document, not just the active one

## 1.5.0

## 1.4.1

## 1.4.0

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

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update bookmark plugin to have shared code between react and preact to simplify workflow

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
