---
'@embedpdf/plugin-signature': minor
---

A named type for the state: `SignatureState`, what `signatureState` reads and `useSignatureState()` returns, the State table of the signatures page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `SignatureModel`, made by `initialSignatureModel()`, so `SignatureState` has one meaning.
