---
'@cloudpdf/contract': minor
---

Add `doc.downloadLink` (`POST /v1/docs/{docId}/layers/{layerName}/download-link`, `doc.download`): a short-lived URL (`expiresIn` 60 to 3600 seconds, default 300) that downloads the layer's current PDF with a plain GET and no Authorization header, for services that only take a URL. It downloads that one file as it is when made, and answers 404 once the layer changes.
