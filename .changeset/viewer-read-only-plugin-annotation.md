---
'@embedpdf/plugin-annotation': minor
---

Add the `editable` setting: which annotations people may change by hand, `true` (the default), `false`, or a list of kinds by subtype, a measurement by its intent (`'line-dimension'`). One it leaves out can still be selected, read and commented on, but not moved, resized, turned, restyled, typed in or deleted by hand; it changes live with `updateSettings()`. Code still changes it, and `canUpdate()` and `canDelete()` stay the same. New `isEditable(ref)`. A double click on a text box whose text may not change now selects it instead of doing nothing.
