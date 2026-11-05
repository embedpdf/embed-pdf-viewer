---
'@cloudpdf/sdk': minor
---

Names follow one rule: `sizeBytes` (documents, layers, versions and the init request), `baseSha256`, a manifest's `baseSizeBytes`, `uploadTtlSeconds` (also on `uploads.create`), `expiresInSeconds`, `docIds`, `md5`, `displaySha256` and `sourceSha256`, `contentsSizeBytes`, `changedRefs`, usage metrics `pdfViews`, `pdfUploads` and `storageBytes` with module meters in a typed `moduleMeters` map, a `submit-form` action's named flags, a seed value's `…Required` booleans and `parserVersion`, and the path arguments `docId`, `annotationKey`, `sha256` and `displaySha256`. `/access`, the event stream's `session` event and object-number reservations say `expiresInSeconds`. Action trees drop `warningFlags`.
