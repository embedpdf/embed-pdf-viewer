---
'@cloudpdf/server': patch
---

`redactions.apply` parses its body with `RedactionApplyScopeInputSchema`, which still refuses a field it doesn't know, now that the scope a response carries is read tolerantly.
