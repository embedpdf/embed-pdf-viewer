---
'@embedpdf/core-annotation': minor
---

The session carries an `editable` rule: which annotations people may change by hand (`true`, `false`, or kinds by subtype, a measurement by its intent). The gesture gates read it beside `locked` and the record's authority, so an annotation it leaves out is selected, hovered and commented on but has no handles, rotate knob or drag, takes no text editing, and the selection's edits and delete skip it. New exports: `isEditableByHand`, `isTransformableByHand`, `isDeletableByHand`, `isContentsEditableByHand`, `editableKindOf` and the `EditableKinds` type.
