---
'@cloudpdf/server': patch
---

Fill in a field, or draw a mark into a signature field and sign it, after another signature, and that signature now stays valid in Acrobat and in the analysis. A fill records nobody now, so a values import needs only what a fill needs, no longer `doc.forms.import`, and form reads give `filledBy`, `filledByName` and `filledAt` as `null` (cached form reads get new URLs).
