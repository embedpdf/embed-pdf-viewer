---
'@embedpdf/engine-core': minor
---

Add the `*.renderEncoded` wire kinds (`pages.renderEncoded`,
`document.renderPageFileEncoded`, `annotations.renderAppearancesEncoded`)
plus their `RenderEncode` / `EncodedImageWire` shapes — cloud-server
surface (types only): the raster is encoded where it is produced and only
the compressed image crosses the engine boundary.
