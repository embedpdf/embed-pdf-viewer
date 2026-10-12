---
'@embedpdf/engine': minor
---

- `doc.security.fieldRights()`: the groups the handle may fill in, sign and assign.
- `doc.forms.applyEffects` is removed: write a script run's effects as one change with `doc.apply`.
- A reset of fields already at their defaults, or hiding a field that's already hidden, can't be undone: nothing was written.
