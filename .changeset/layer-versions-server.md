---
'@cloudpdf/server': patch
---

A layer's versions are read through the layer. The version routes moved from `/v1/docs/:docId/versions…` to `/v1/docs/:docId/layers/:layerName/versions…`, checked like every other layer route.

- **The list** gives the layer's versions (the upload, then the ones its signatures made) and its `baseSha`.
- **A version's signatures, analysis, download and revisions** answer only for the upload or the layer's own versions: another layer's version is 404, and a token for one layer can't use another layer's path.
- **Tenant tokens** read any layer's versions, through that layer.
