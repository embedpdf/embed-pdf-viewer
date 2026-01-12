# @embedpdf/plugin-zoom

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The zoom plugin now supports per-document zoom levels and marquee zoom state.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setZoomLevel(documentId, zoomLevel, currentZoomLevel)` - was `setZoomLevel(zoomLevel, currentZoomLevel)`
    - Removed `setInitialZoomLevel` action
  - **State Structure**: Plugin state now uses `documents: Record<string, ZoomDocumentState>` to track per-document zoom levels and marquee zoom state.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **MarqueeZoom Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-zoom/react`, Svelte: `@embedpdf/plugin-zoom/svelte`, Vue: `@embedpdf/plugin-zoom/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `useDocumentState` hook to get document scale automatically
  - **PinchWrapper Component**:
    - Now requires `documentId` prop
    - Uses document-scoped zoom operations

  ### New Features
  - Per-document zoom level tracking
  - Per-document marquee zoom state
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

- [#301](https://github.com/embedpdf/embed-pdf-viewer/pull/301) by [@bobsingor](https://github.com/bobsingor) – ## ZoomGestureWrapper (formerly PinchWrapper)

  Renamed `PinchWrapper` to `ZoomGestureWrapper` and added wheel zoom support alongside pinch-to-zoom.

  ### Breaking Changes
  - **Renamed Component**: `PinchWrapper` → `ZoomGestureWrapper`
  - **Renamed Hook**: `usePinch` → `useZoomGesture`
  - **Removed Hammer.js dependency**: Gesture handling is now implemented natively

  ### New Features
  - **Wheel zoom**: Ctrl/Cmd + scroll wheel now zooms the document
  - **Configurable gestures**: New props to enable/disable individual gesture types:
    - `enablePinch` (default: `true`) - Enable/disable pinch-to-zoom
    - `enableWheel` (default: `true`) - Enable/disable wheel zoom
  - **Improved performance**: Uses `useLayoutEffect` to prevent flashing during zoom operations
  - **Simplified internals**: Uses direct DOM measurements instead of plugin metrics

  ### Migration

  ```diff
  - import { PinchWrapper } from '@embedpdf/plugin-zoom/react';
  + import { ZoomGestureWrapper } from '@embedpdf/plugin-zoom/react';

  - <PinchWrapper documentId={documentId}>
  + <ZoomGestureWrapper documentId={documentId}>
      <Scroller ... />
  - </PinchWrapper>
  + </ZoomGestureWrapper>
  ```

  To disable a specific gesture:

  ```tsx
  <ZoomGestureWrapper
    documentId={documentId}
    enablePinch={false}  // Disable pinch-to-zoom
    enableWheel={true}   // Keep wheel zoom
  >
  ```

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The zoom plugin now supports per-document zoom levels and marquee zoom state.

  ### Breaking Changes
  - **Actions**: All actions now require `documentId`:
    - `setZoomLevel(documentId, zoomLevel, currentZoomLevel)` - was `setZoomLevel(zoomLevel, currentZoomLevel)`
    - Removed `setInitialZoomLevel` action
  - **State Structure**: Plugin state now uses `documents: Record<string, ZoomDocumentState>` to track per-document zoom levels and marquee zoom state.
  - **Capability Methods**: Methods now operate on the active document by default, or use `forDocument(id)` for specific documents.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **MarqueeZoom Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-zoom/react`, Svelte: `@embedpdf/plugin-zoom/svelte`, Vue: `@embedpdf/plugin-zoom/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `useDocumentState` hook to get document scale automatically
  - **PinchWrapper Component**:
    - Now requires `documentId` prop
    - Uses document-scoped zoom operations

  ### New Features
  - Per-document zoom level tracking
  - Per-document marquee zoom state
  - `forDocument()` method for document-scoped operations
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

### Patch Changes

- [#236](https://github.com/embedpdf/embed-pdf-viewer/pull/236) by [@eposha](https://github.com/eposha) – Increase zoom precision from two decimals to three (changed rounding from `/100` to `/1000`) to improve smoother zoom granularity and reduce jumpy transitions.

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `MarqueeZoom.svelte`, `PinchWrapper.svelte` components and `useZoom`, `usePinch` hooks to work with refactored core hooks and return reactive state objects.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useZoom`, `usePinch`), components (`MarqueeZoom.svelte`, `PinchWrapper.svelte`), and fix for initialization timing. Thanks to @andrewrisse for adding the Svelte components and hooks!

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

### Patch Changes

- [#98](https://github.com/embedpdf/embed-pdf-viewer/pull/98) by [@bobsingor](https://github.com/bobsingor) – Move interaction manager handlers to the plugin for smaller and cleaner framework layers

## 1.0.19

## 1.0.18

## 1.0.17

## 1.0.16

### Patch Changes

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Change to activeDefaultMode instead of active('default')

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update zoom plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Make area zoom work properly when page is rotated

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
