---
'@embedpdf/plugin-redaction': minor
---

A named type for the state: `RedactionState`, what `redactionState` reads and `useRedactionState()` returns, the State table of the redaction page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `RedactionModel`, made by `initialRedactionModel()`, so `RedactionState` has one meaning.
