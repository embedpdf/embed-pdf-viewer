---
'@cloudpdf/engine': patch
---

A document's signed bytes (`signatures.getContents`, `getDigest`, `downloadRevision` and history `analyze`) are read through its layer's version paths.
