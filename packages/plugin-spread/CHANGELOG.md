# @embedpdf/plugin-spread

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The spread plugin now supports per-document spread mode and page grouping.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setSpreadMode(documentId, spreadMode)` - was `setSpreadMode(mode)`
    - Added `setPageGrouping(documentId, grouping)` action for custom page grouping
  - **State Structure**: Plugin state now uses `documents: Record<string, SpreadDocumentState>` to track per-document spread mode and page grouping.
  - **Action Creators**: All action creators now require `documentId`:
    - `initSpreadState(documentId, state)`
    - `setSpreadMode(documentId, spreadMode)`
    - `setPageGrouping(documentId, grouping)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **useSpread Hook**:
    - Now requires `documentId` parameter: `useSpread(documentId)` (React/Preact: `@embedpdf/plugin-spread/react`, Svelte: `@embedpdf/plugin-spread/svelte`, Vue: `@embedpdf/plugin-spread/vue`)
    - Returns document-scoped spread capability via `forDocument()`
    - Subscribes to document-specific spread mode changes

  ### New Features
  - Per-document spread mode tracking
  - Per-document page grouping configuration
  - Document lifecycle management with automatic state initialization and cleanup

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The spread plugin now supports per-document spread mode and page grouping.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setSpreadMode(documentId, spreadMode)` - was `setSpreadMode(mode)`
    - Added `setPageGrouping(documentId, grouping)` action for custom page grouping
  - **State Structure**: Plugin state now uses `documents: Record<string, SpreadDocumentState>` to track per-document spread mode and page grouping.
  - **Action Creators**: All action creators now require `documentId`:
    - `initSpreadState(documentId, state)`
    - `setSpreadMode(documentId, spreadMode)`
    - `setPageGrouping(documentId, grouping)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **useSpread Hook**:
    - Now requires `documentId` parameter: `useSpread(documentId)` (React/Preact: `@embedpdf/plugin-spread/react`, Svelte: `@embedpdf/plugin-spread/svelte`, Vue: `@embedpdf/plugin-spread/vue`)
    - Returns document-scoped spread capability via `forDocument()`
    - Subscribes to document-specific spread mode changes

  ### New Features
  - Per-document spread mode tracking
  - Per-document page grouping configuration
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `useSpread` hook to return a reactive state object, aligning with the core hook refactoring.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useSpread`, etc.).

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

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Streamlined `SpreadCapability` and simplified Vue hook behavior.
  - Removed `getSpreadPagesObjects(pages: PdfPageObject[]): PdfPageObject[][]` from `SpreadCapability`.
    - Spread grouping is now an internal concern of the spread plugin/strategies.
  - Vue `useSpread` hook refactor:
    - Replaced `watchEffect`/manual unsubscription with a `watch(provides, …, { immediate: true })` pattern that:
      - Initializes `spreadMode` from `provides.getSpreadMode()`.
      - Subscribes via `provides.onSpreadChange`, auto-cleaning the subscription.

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

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update spread plugin to have shared code between react and preact to simplify workflow

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
