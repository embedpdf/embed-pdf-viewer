---
'@cloudpdf/sdk': minor
---

`doc.signatures.validationInfo()` and `doc.signatures.addValidationInfo()` read and store the validation data a file holds for checking its signatures with no network: certificates, OCSP responses and CRLs, each entry as base64. A prepared signature's answer may carry `field`, the field the engine made for a document timestamp prepared with none.
