---
'@cloudpdf/contract': patch
---

The `doc.versions.*` operations take the layer: their paths are `/v1/docs/:docId/layers/:layerName/versions…`. `doc.versions.list` answers `LayerVersions` (`{ baseSha, versions }`): the layer's base and its versions, the upload first.
