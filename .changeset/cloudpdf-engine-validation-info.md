---
'@cloudpdf/engine': patch
---

`doc.signatures.getValidationInfo()` and `doc.signatures.addValidationInfo()` exist on the cloud engine and fail with `NotImplemented`: the server has no route for a document's validation data yet. The local engine has both.

A document timestamp prepared with no `field` fails with `NotImplemented` too: the server makes no field for one yet. Name the `field` to timestamp in.
