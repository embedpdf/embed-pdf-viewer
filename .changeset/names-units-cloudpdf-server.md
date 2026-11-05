---
'@cloudpdf/server': minor
---

Takes and sends the renamed fields: `sizeBytes` (documents, layers, versions), `baseSha256`, the manifest's `baseSizeBytes`, `uploadTtlSeconds`, `expiresInSeconds` (also the editing session's on `/access`, the event stream and object-number reservations), `docIds` and the camelCase usage metrics, and names its path parameters `docId`, `annotationKey`, `sha256` and `displaySha256`.
