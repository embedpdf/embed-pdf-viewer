---
'@cloudpdf/server': minor
---

The document's outline: `GET /v1/docs/:docId/outline@{token}` (shared and cacheable while a layer inherits the outline and the layout) and `GET /v1/docs/:docId/layers/:layerName/outline`, with outline edits through `POST …/changes`. Layers and published versions carry an outline version (migration `035_outline_version`), outline ops move it, and its plane decides when a layer reads the shared outline. A token that may change the outline (`doc.outline.modify`) is handed object numbers for new items, as one that may create annotations is.
