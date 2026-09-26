---
'@embedpdf/engine-runtime': minor
---

Renders vector-heavy pages faster with byte-identical output: the rasterizer reuses its buffers across paths instead of allocating them for every path, and content streams build each path without temporary copies. On a CAD plot of six million strokes a full-page render takes about half the time and parsing about a third less. The WASM build is now linked with `-O3`, which makes `embedpdf.wasm` about 9% smaller. Adds `EPDFPage_ResetRenderCache`, which empties a loaded page's image cache so its next render decodes images as a newly loaded page does.
