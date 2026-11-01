---
'@embedpdf/engine-services': minor
---

`pages.insert` and `pages.extract` bring the form fields of the copied pages' widgets, written into the document's `/AcroForm`, so the fields stay fillable after a save and in other PDF apps. An extract brings only the widgets on the extracted pages. An inserted top-level field whose name the document already uses comes in as `name_2` (or the next free number), with its fields under it, so two copies of a filled-in form keep their own values.
