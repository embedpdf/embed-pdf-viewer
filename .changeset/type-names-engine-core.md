---
'@embedpdf/engine-core': minor
---

`FormField` (with `TextField`, `CheckboxField`, `RadioField`, `ComboBoxField`, `ListBoxField`, `PushButtonField`, `SignatureField` and `UnknownField`) and `Signature` replace the `…DTO` names. The deprecated `Point`, `Rect`, `Size` and `Rotation` aliases and `PointSchema`/`RectSchema` are gone: use the `Pdf…` names. Exported functions take `options`, never `opts`.
