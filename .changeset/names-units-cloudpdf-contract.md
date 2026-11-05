---
'@cloudpdf/contract': minor
---

Names and units follow one rule: a document's `baseSha` and `storageSizeBytes` are `baseSha256` and `sizeBytes`, and so is a layer's and a visitor's layer's `storageSizeBytes`; the init request's `contentLength` and `uploadTtlSec` are `sizeBytes` and `uploadTtlSeconds`; token issue's and the download link's `expiresIn` is `expiresInSeconds`; folders move-into takes `docIds` (its 404 names `details.docIds`); usage metrics are `pdfViews`, `pdfUploads` and `storageBytes`; and the path parameters are `{docId}`, `{annotationKey}`, `{sha256}` and `{displaySha256}` (the URLs don't change).
