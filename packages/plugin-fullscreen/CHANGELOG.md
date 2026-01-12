# @embedpdf/plugin-fullscreen

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The fullscreen plugin now supports per-document fullscreen state and target element configuration.

  ### Breaking Changes
  - **Constructor**: Plugin constructor now requires `config` parameter.
  - **Methods**:
    - `enableFullscreen(targetElement?)` - Now accepts optional target element selector
    - `toggleFullscreen(targetElement?)` - Now accepts optional target element selector
  - **Events**: `FullscreenRequestEvent` now includes `documentId` field for document context.
  - **Configuration**: Added `getTargetSelector()` method to get the current target element selector (from last request or config default).

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **FullscreenProvider Component**:
    - Updated to handle document-scoped fullscreen requests (React/Preact: `@embedpdf/plugin-fullscreen/react`, Svelte: `@embedpdf/plugin-fullscreen/svelte`, Vue: `@embedpdf/plugin-fullscreen/vue`)
    - Now uses `getTargetSelector()` to determine target element for fullscreen
    - Uses new `handleFullscreenRequest` utility for proper target element handling

  ### New Features
  - Per-document fullscreen state tracking
  - Configurable target element for fullscreen operations
  - Document-aware fullscreen request events

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The fullscreen plugin now supports per-document fullscreen state and target element configuration.

  ### Breaking Changes
  - **Constructor**: Plugin constructor now requires `config` parameter.
  - **Methods**:
    - `enableFullscreen(targetElement?)` - Now accepts optional target element selector
    - `toggleFullscreen(targetElement?)` - Now accepts optional target element selector
  - **Events**: `FullscreenRequestEvent` now includes `documentId` field for document context.
  - **Configuration**: Added `getTargetSelector()` method to get the current target element selector (from last request or config default).

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **FullscreenProvider Component**:
    - Updated to handle document-scoped fullscreen requests (React/Preact: `@embedpdf/plugin-fullscreen/react`, Svelte: `@embedpdf/plugin-fullscreen/svelte`, Vue: `@embedpdf/plugin-fullscreen/vue`)
    - Now uses `getTargetSelector()` to determine target element for fullscreen
    - Uses new `handleFullscreenRequest` utility for proper target element handling

  ### New Features
  - Per-document fullscreen state tracking
  - Configurable target element for fullscreen operations
  - Document-aware fullscreen request events

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `FullscreenProvider.svelte` component and `useFullscreen` hook to work with the refactored Svelte core hooks, returning reactive state objects.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useFullscreen`, etc.) and `FullscreenProvider.svelte` wrapper component.

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

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update fullscreen plugin to have shared code between react and preact to simplify workflow

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
