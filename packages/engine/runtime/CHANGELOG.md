# @embedpdf/engine-runtime

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Generate rotated caret appearances in the EmbedPDF PDFium runtime.

  The caret appearance generator now consumes the shared rotation metadata pair, draws in the logical unrotated box, and emits the form transform needed for the baked caret to follow its text baseline.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Updates the EmbedPDF PDFium runtime with oriented per-character geometry and orientation-aware text-markup appearance generation for rotated, sheared, and mirrored text, while retaining safe fallbacks for malformed quads.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the low-level EmbedPDF execution runtime backed by the EmbedPDF PDFium fork. It selects and exposes the appropriate WASM or native platform build used by higher-level engine services.
