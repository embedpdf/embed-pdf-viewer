---
'@embedpdf/engine-core': minor
---

Deprecate `FormField.filledBy`, `filledByName` and `filledAt`: they always read `null`, because a fill no longer records who filled a field in. A fill writes only the value and its drawing, as every PDF app does, so a signature made before it stays valid. `FormValuesImportOptions.attribution` is deprecated too and has no effect. All four go in 4.0. `runFormAttributionConformance` takes a `sign` option, for an engine whose server judges a completion's CMS.
