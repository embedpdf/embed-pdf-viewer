# @embedpdf/pdfium

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

### Patch Changes

- [#181](https://github.com/embedpdf/embed-pdf-viewer/pull/181) by [@bobsingor](https://github.com/bobsingor) – Add new function EPDF_GetPageRotationByIndex

## 1.3.1

### Patch Changes

- [#175](https://github.com/embedpdf/embed-pdf-viewer/pull/175) by [@bobsingor](https://github.com/bobsingor) – add addAttachment and removeAttachment functions to pdfium and the engine

## 1.3.0

### Patch Changes

- [#170](https://github.com/embedpdf/embed-pdf-viewer/pull/170) by [@bobsingor](https://github.com/bobsingor) – Add ability to setBookmarks and deleteBookmarks

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

### Patch Changes

- [#150](https://github.com/embedpdf/embed-pdf-viewer/pull/150) by [@bobsingor](https://github.com/bobsingor) – Add ability to get the language from the root, add function to PDFium EPDFCatalog_GetLanguage

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Add new function to PDFium EPDFAnnot_UpdateAppearanceToRect to be able to update the appearance stream on resize of the stamp image annotation

## 1.1.1

## 1.1.0

## 1.0.26

### Patch Changes

- [#134](https://github.com/embedpdf/embed-pdf-viewer/pull/134) by [@bobsingor](https://github.com/bobsingor) – Add DEFAULT_PDFIUM_WASM_URL also to the pdfium package

- [#132](https://github.com/embedpdf/embed-pdf-viewer/pull/132) by [@bobsingor](https://github.com/bobsingor) – Update PDF meta data to include trapped and custom values

## 1.0.25

## 1.0.24

## 1.0.23

### Patch Changes

- [#125](https://github.com/embedpdf/embed-pdf-viewer/pull/125) by [@bobsingor](https://github.com/bobsingor) – Add fallback if offscreen canvas is not supported (this will solve #50)

## 1.0.22

## 1.0.21

### Patch Changes

- [#118](https://github.com/embedpdf/embed-pdf-viewer/pull/118) by [@bobsingor](https://github.com/bobsingor) – Add the option to setMetadata for a PDF document

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add function EPDFPage_RemoveAnnotRaw so that we cheaply can remove an annotation

## 1.0.20

### Patch Changes

- [#114](https://github.com/embedpdf/embed-pdf-viewer/pull/114) by [@bobsingor](https://github.com/bobsingor) – Fix issue with redaction as described in issue #109

## 1.0.19

## 1.0.18

### Patch Changes

- [`3f32381`](https://github.com/embedpdf/embed-pdf-viewer/commit/3f323812871b3014604769ba9c95c399fb91f8ba) by [@bobsingor](https://github.com/bobsingor) – Update removeAnnotByName to properly remove indirect object when there

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Support for redactions (properly redact, remove text objects, remove parts of images and paths)

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add new function EPDFPage_GetAnnotCountRaw and EPDFPage_GetAnnotRaw to increase speed of annotations

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add support for comments on annotations

## 1.0.16

## 1.0.15

## 1.0.14

### Patch Changes

- [#52](https://github.com/embedpdf/embed-pdf-viewer/pull/52) by [@bobsingor](https://github.com/bobsingor) – Add support for (basic) free text annotation

## 1.0.13

### Patch Changes

- [#51](https://github.com/embedpdf/embed-pdf-viewer/pull/51) by [@bobsingor](https://github.com/bobsingor) – Add support for polygon, polyline, line, arrow line annotations

- [#49](https://github.com/embedpdf/embed-pdf-viewer/pull/49) by [@bobsingor](https://github.com/bobsingor) – Add support for square and circle annotations

## 1.0.12

### Patch Changes

- [#46](https://github.com/embedpdf/embed-pdf-viewer/pull/46) by [@bobsingor](https://github.com/bobsingor) – Ability to generate AP stream with blend mode and show blendmode in annotations

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Improvements on text markup annotations (proper AP stream generation) and support for ink annotation

## 1.0.7

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

### Patch Changes

- [#21](https://github.com/embedpdf/embed-pdf-viewer/pull/21) by [@bobsingor](https://github.com/bobsingor) – Expose all PDFium functions

## 1.0.2

## 1.0.1
