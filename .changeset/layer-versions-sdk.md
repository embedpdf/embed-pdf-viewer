---
'@cloudpdf/sdk': minor
---

`doc.versions.*` takes the layer: `list`, `signatures`, `signatureContents`, `signatureDigest`, `analysis`, `download` and `revision` read `/v1/docs/{docId}/layers/{layerName}/versions…`. `list` answers the layer's `baseSha` and its versions (the upload, then the ones its signatures made), and another layer's version is 404.
