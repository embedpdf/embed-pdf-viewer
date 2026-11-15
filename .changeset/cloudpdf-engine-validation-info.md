---
'@cloudpdf/engine': patch
---

`doc.signatures.getValidationInfo()` and `doc.signatures.addValidationInfo()` exist on the cloud engine and fail with `NotImplemented`: the server has no route for a document's validation data yet. The local engine has both.
