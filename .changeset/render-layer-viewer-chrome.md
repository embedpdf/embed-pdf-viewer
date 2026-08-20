---
'@embedpdf/viewer-chrome': patch
---

Adopt the unified `RenderLayer` page composition so the full viewer gets policy-driven deep-zoom tiling without mounting a separate tile layer. Base and sharp tile pixels now follow one rendering lifecycle through zoom, pan, annotation, and page-view surfaces.
