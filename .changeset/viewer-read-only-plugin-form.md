---
'@embedpdf/plugin-form': minor
---

Add the `fillable` setting: which fields people may fill in by hand, `true` (the default), `false`, or a list of field families. A field it leaves out draws as a read-only field does and takes no input; `setValue()`, `importValues()` and `canFill()` are unchanged.
