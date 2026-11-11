---
'@embedpdf/plugin-annotation': minor
---

`selection.duplicate()` copies a form's widgets too, in design mode: their owner says how (a radio button's copy joins its group, any other widget's is a new field), and the copies are made in the same change as the annotations', so a selection of both is one step to undo. `selection.canDuplicate()` asks the owner for them. `duplicate(refs)` still refuses a widget. For a plugin that lends records (`AnnotationLender`): `copyOps(refs, placement)` gives the ops that copy its records, and `getAuthority()` also says `copy`.
