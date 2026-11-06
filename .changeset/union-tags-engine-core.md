---
'@embedpdf/engine-core': minor
---

A form field is tagged `kind`, not `family`, as naming.md tags things that are: `field.kind === 'checkbox'`, the type `FormFieldKind`, a draft's and a patch's `kind`, and a widget annotation's `fieldKind`. A values import's diagnostics say `unsupported-kind` and `wrong-kind`.
