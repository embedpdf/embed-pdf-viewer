---
'@embedpdf/plugin-search': patch
---

Keep search result ranges aligned with selection character space when extracted text contains non-printing or supplementary-plane characters. A result's `charStart` and `charCount` can now be passed to selection and markup flows without offset drift.
