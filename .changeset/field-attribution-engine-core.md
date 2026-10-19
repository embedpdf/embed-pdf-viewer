---
'@embedpdf/engine-core': minor
---

Form fields say who created them and who last filled them in: `createdBy`, `createdAt`, `filledBy`, `filledByName`, `filledAt` and `importedBy`, stamped by the engine from the session's identity and stored in the field's own `/EMBD_Metadata`. A write that changes a value names its filler, a script's value counts as filled in by the user whose fill ran it, a reset and an anonymous fill name nobody, and undoing a fill puts the previous filler back. Widget rows report no attribution of their own: the field holds it. The form worker requests carry the `actor`. New suite `runFormAttributionConformance`.

Two grant-only rights: `doc.forms.import` (an import keeps who created and filled in the fields; a signature removes it with `doc.forms.fill`) and `doc.forms.script` (write scripts, submit-form and URI actions into the form; a signature removes it with `doc.forms.modify`). `pdf.permissions` never expands either. Builders `caps.doc.forms.import()` and `caps.doc.forms.script()`.
