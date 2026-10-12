---
'@embedpdf/plugin-form': minor
---

`reorderCalculations(fields, position)`. `create()` and `update()` take field scripts (`actions`), refused up front without `doc.forms.script`. The form mirror takes the calculation order from `forms.calculationsReordered` and from writes that changed it, so a script added through `update()` runs from the next fill on.
