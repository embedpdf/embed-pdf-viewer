# @embedpdf/engines

## 2.0.0-next.0

### Minor Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  Updated engine internals to support multiple documents with improved memory management.

  ### Changes
  - **Memory Management**: Enhanced memory tracking through `MemoryManager` for proper cleanup of multiple document instances.
  - **Cache**: `PdfCache` now properly tracks and manages multiple document contexts with improved memory management through the memory manager.

  ### Technical Details
  - Document contexts now use `MemoryManager` for proper WASM pointer tracking and cleanup
  - Improved resource management for concurrent document handling

## 1.5.0

### Minor Changes

- [#238](https://github.com/embedpdf/embed-pdf-viewer/pull/238) by [@0xbe7a](https://github.com/0xbe7a) – Add optional **form widget rendering** to the render pipeline.

  ### What changed
  - **@embedpdf/models**
    - `PdfRenderPageOptions` now supports `withForms?: boolean` to request drawing interactive form widgets.

  - **@embedpdf/engines**
    - `PdfiumEngine.renderPage` and `renderPageRect` honor `withForms`.
      When enabled, the engine initializes the page form handle and calls `FPDF_FFLDraw` with the correct device transform.
    - New helper `computeFormDrawParams(matrix, rect, pageSize, rotation)` calculates start offsets and sizes for `FPDF_FFLDraw`.

  - **@embedpdf/plugin-render**
    - New plugin config flags:
      - `withForms?: boolean` (default `false`)
      - `withAnnotations?: boolean` (default `false`)
    - The plugin merges per-call options with plugin defaults so callers can set once at init or override per call.

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `usePdfiumEngine` hook to return a reactive `$state` object directly, simplifying state management for consumers.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with `PdfEngineProvider` component and Rune-based hooks (`useEngineContext`, `useEngine`, `usePdfiumEngine`). Removed deprecated mock engine. Thanks to @andrewrisse!

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

### Patch Changes

- [`3409705`](https://github.com/embedpdf/embed-pdf-viewer/commit/3409705a52afd5fb34a0cdca3e6d5634000f2adb) by [@bobsingor](https://github.com/bobsingor) – Fix stamp scaling issue

## 1.3.3

### Patch Changes

- [#183](https://github.com/embedpdf/embed-pdf-viewer/pull/183) by [@bobsingor](https://github.com/bobsingor) – Fix issues with redaction and annotation on a page that is fixed rotated

## 1.3.2

## 1.3.1

### Patch Changes

- [#175](https://github.com/embedpdf/embed-pdf-viewer/pull/175) by [@bobsingor](https://github.com/bobsingor) – add addAttachment and removeAttachment functions to pdfium and the engine

## 1.3.0

### Patch Changes

- [#170](https://github.com/embedpdf/embed-pdf-viewer/pull/170) by [@bobsingor](https://github.com/bobsingor) – Add ability to setBookmarks and deleteBookmarks

## 1.2.1

## 1.2.0

### Patch Changes

- [#150](https://github.com/embedpdf/embed-pdf-viewer/pull/150) by [@bobsingor](https://github.com/bobsingor) – Add ability to get the language from the root, add function to PDFium EPDFCatalog_GetLanguage

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Add new function to PDFium EPDFAnnot_UpdateAppearanceToRect to be able to update the appearance stream on resize of the stamp image annotation

## 1.1.1

## 1.1.0

### Patch Changes

- [#137](https://github.com/embedpdf/embed-pdf-viewer/pull/137) by [@bobsingor](https://github.com/bobsingor) – Add engine context provider to React and Vue

## 1.0.26

### Patch Changes

- [#132](https://github.com/embedpdf/embed-pdf-viewer/pull/132) by [@bobsingor](https://github.com/bobsingor) – Update PDF meta data to include trapped and custom values

## 1.0.25

### Patch Changes

- [`b741036`](https://github.com/embedpdf/embed-pdf-viewer/commit/b7410368e5bbe00dca339c9c31b380e913d4e52c) by [@bobsingor](https://github.com/bobsingor) – Export DEFAULT_PDFIUM_WASM_URL for easy way to get the PDFium URL

## 1.0.24

### Patch Changes

- [#127](https://github.com/embedpdf/embed-pdf-viewer/pull/127) by [@bobsingor](https://github.com/bobsingor) – Add yield function to check for abortions before executing

- [#127](https://github.com/embedpdf/embed-pdf-viewer/pull/127) by [@bobsingor](https://github.com/bobsingor) – Add Memory Manager to the engine for better memory safety

## 1.0.23

### Patch Changes

- [#125](https://github.com/embedpdf/embed-pdf-viewer/pull/125) by [@bobsingor](https://github.com/bobsingor) – Add fallback if offscreen canvas is not supported (this will solve #50)

## 1.0.22

## 1.0.21

### Patch Changes

- [#118](https://github.com/embedpdf/embed-pdf-viewer/pull/118) by [@bobsingor](https://github.com/bobsingor) – Add the option to setMetadata for a PDF document

- [#115](https://github.com/embedpdf/embed-pdf-viewer/pull/115) by [@bobsingor](https://github.com/bobsingor) – Fix attachment issue

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add function EPDFPage_RemoveAnnotRaw so that we cheaply can remove an annotation

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Properly save annotation flags

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add preparePrintDocument function to the engine

## 1.0.20

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Support for redactions (properly redact, remove text objects, remove parts of images and paths)

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add posibility for progress on Task

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add new function EPDFPage_GetAnnotCountRaw and EPDFPage_GetAnnotRaw to increase speed of annotations

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add support for comments on annotations

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Ability to stream search results for better experience on large documents

## 1.0.16

## 1.0.15

### Patch Changes

- [#54](https://github.com/embedpdf/embed-pdf-viewer/pull/54) by [@bobsingor](https://github.com/bobsingor) – Add support for image stamp

## 1.0.14

### Patch Changes

- [#52](https://github.com/embedpdf/embed-pdf-viewer/pull/52) by [@bobsingor](https://github.com/bobsingor) – Add support for (basic) free text annotation

## 1.0.13

### Patch Changes

- [#51](https://github.com/embedpdf/embed-pdf-viewer/pull/51) by [@bobsingor](https://github.com/bobsingor) – Add support for polygon, polyline, line, arrow line annotations

- [#49](https://github.com/embedpdf/embed-pdf-viewer/pull/49) by [@bobsingor](https://github.com/bobsingor) – Add support for square and circle annotations

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update engines to have shared code between react and preact to simplify workflow

- [#46](https://github.com/embedpdf/embed-pdf-viewer/pull/46) by [@bobsingor](https://github.com/bobsingor) – Ability to generate AP stream with blend mode and show blendmode in annotations

## 1.0.11

## 1.0.10

## 1.0.9

### Patch Changes

- [`d4c602c`](https://github.com/embedpdf/embed-pdf-viewer/commit/d4c602cf2045ee06eec56ec794d5f4dbb4613131) by [@bobsingor](https://github.com/bobsingor) – Make config of the usePdfiumEngine completely optional

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Improvements on text markup annotations (proper AP stream generation) and support for ink annotation

## 1.0.7

### Patch Changes

- [#35](https://github.com/embedpdf/embed-pdf-viewer/pull/35) by [@bobsingor](https://github.com/bobsingor) – Text markup annotation support (Highlight, Underline, Strikeout, Squiggle)

## 1.0.6

### Patch Changes

- [#29](https://github.com/embedpdf/embed-pdf-viewer/pull/29) by [@bobsingor](https://github.com/bobsingor) – Improve text selection and add ability to get text for a specific selection

## 1.0.5

### Patch Changes

- [#28](https://github.com/embedpdf/embed-pdf-viewer/pull/28) by [@bobsingor](https://github.com/bobsingor) – Ability to capture a part of the PDF and save it to image

## 1.0.4

### Patch Changes

- [#24](https://github.com/embedpdf/embed-pdf-viewer/pull/24) by [@bobsingor](https://github.com/bobsingor) – Move PDF engine hook to the engine package for consistency

## 1.0.3

### Patch Changes

- [#21](https://github.com/embedpdf/embed-pdf-viewer/pull/21) by [@bobsingor](https://github.com/bobsingor) – Expose all PDFium functions

## 1.0.2

## 1.0.1
