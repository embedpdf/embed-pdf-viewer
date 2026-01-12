# @embedpdf/plugin-capture

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The capture plugin now supports multiple documents with per-document state management.

  ### Breaking Changes
  - **CaptureAreaEvent**: Now includes `documentId` field. All capture events are scoped to a specific document.
  - **RegisterMarqueeOnPageOptions**: Now requires `documentId` field to specify which document the marquee capture should be registered for.
  - **CaptureCapability**:
    - Removed `onMarqueeCaptureActiveChange` event hook
    - Added `onStateChange` event hook that emits `StateChangeEvent` with `documentId` and state
    - Added `getState()` method to get current document state
    - Added `forDocument(documentId: string)` method that returns a `CaptureScope` for document-specific operations
  - **State Management**: Plugin now maintains per-document state with `CaptureDocumentState` tracking `isMarqueeCaptureActive` per document.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **MarqueeCapture Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-capture/react`, Svelte: `@embedpdf/plugin-capture/svelte`, Vue: `@embedpdf/plugin-capture/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `useDocumentState` hook to get document scale automatically
  - **useCapture Hook**:
    - Now requires `documentId` parameter: `useCapture(documentId)`
    - Returns document-scoped capture state and operations

  ### New Features
  - `CaptureScope` interface for document-scoped operations
  - Per-document marquee capture state tracking
  - Document lifecycle management with automatic state initialization and cleanup
  - `forDocument()` method for operating on specific documents

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The capture plugin now supports multiple documents with per-document state management.

  ### Breaking Changes
  - **CaptureAreaEvent**: Now includes `documentId` field. All capture events are scoped to a specific document.
  - **RegisterMarqueeOnPageOptions**: Now requires `documentId` field to specify which document the marquee capture should be registered for.
  - **CaptureCapability**:
    - Removed `onMarqueeCaptureActiveChange` event hook
    - Added `onStateChange` event hook that emits `StateChangeEvent` with `documentId` and state
    - Added `getState()` method to get current document state
    - Added `forDocument(documentId: string)` method that returns a `CaptureScope` for document-specific operations
  - **State Management**: Plugin now maintains per-document state with `CaptureDocumentState` tracking `isMarqueeCaptureActive` per document.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **MarqueeCapture Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-capture/react`, Svelte: `@embedpdf/plugin-capture/svelte`, Vue: `@embedpdf/plugin-capture/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Component now uses `useDocumentState` hook to get document scale automatically
  - **useCapture Hook**:
    - Now requires `documentId` parameter: `useCapture(documentId)`
    - Returns document-scoped capture state and operations

  ### New Features
  - `CaptureScope` interface for document-scoped operations
  - Per-document marquee capture state tracking
  - Document lifecycle management with automatic state initialization and cleanup
  - `forDocument()` method for operating on specific documents

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – feat: Add Svelte 5 adapter (`/svelte` export) for the Capture plugin. Includes Rune-based hooks (`useCapture`, `useCaptureCapability`, `useCapturePlugin`) and the `MarqueeCapture.svelte` component.

## 1.4.0

## 1.3.16

## 1.3.15

## 1.3.14

### Patch Changes

- [#212](https://github.com/embedpdf/embed-pdf-viewer/pull/212) by [@bobsingor](https://github.com/bobsingor) – Add reactive state for marquee capture mode

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

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

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

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update capture plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

### Patch Changes

- [#28](https://github.com/embedpdf/embed-pdf-viewer/pull/28) by [@bobsingor](https://github.com/bobsingor) – Ability to capture a part of the PDF and save it to image
