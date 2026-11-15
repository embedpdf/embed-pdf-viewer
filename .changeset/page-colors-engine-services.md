---
'@embedpdf/engine-services': minor
---

`PageRenderReader` draws a page in the colors of `PageRenderOptions.pageColors`: the paper is filled with the colors' `background`, and PDFium's color scheme gives text and shapes their colors, for a whole page or a tile, at every rotation. The render is sliced and can be aborted between slices as a render in normal colors is, where the runtime can call back into the host (wasm). Embedded images, scanned pages and shadings are drawn as the file has them.
