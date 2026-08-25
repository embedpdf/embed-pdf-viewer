---
'@embedpdf/engine-core': minor
---

Add the `*.renderEncoded` wire kinds (`pages.renderEncoded`,
`document.renderPageFileEncoded`, `annotations.renderAppearancesEncoded`)
plus their `RenderEncode` / `EncodedImageWire` shapes — cloud-server
surface (types only): the raster is encoded where it is produced and only
the compressed image crosses the engine boundary.

Make document access endpoints document-scoped by changing
`wirePaths.access` to a `wirePaths.access(docId)` builder. Keep
`wirePaths.accessLegacy` for transitional clients and allow the scoped
endpoint to omit `docId` from the request body.
