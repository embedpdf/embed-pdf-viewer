---
'@embedpdf/plugin-signature': minor
---

`getSignature()` returns `SignatureInfo`, as `listSignatures()` does: the field's facts and its `verdict` (`null` until checked, or for an unsigned field). The `PreparedSignature` alias is gone: `prepareSignature()` resolves `SignaturePrepared`.
