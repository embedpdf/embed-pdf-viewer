---
'@embedpdf/react': minor
---

Consolidate base-page and deep-zoom tile painting into `RenderLayer`, with a `tiles` option for lenses that explicitly disable tiling. The separate `TileLayer` surface is removed because tile engagement is now render-policy arithmetic owned by `RenderLayer`.

Tiles are positioned directly in view-pixel space and use the shared painted-image lifecycle, keeping retained coverage until replacements have a presentation opportunity and avoiding deep-zoom rounding drift, incomplete-image outlines, and transient seams.
