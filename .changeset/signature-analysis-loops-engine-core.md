---
'@embedpdf/engine-core': patch
---

Signature change analysis handles loops of unchanged objects (structure trees, outlines, popups) in one pass. A comment added to a tagged PDF (Chrome, Word) after an approval signature now reads `permitted` instead of `indeterminate`. In `ObjectReferrer` labels, `…` stands for a route inside a loop, as in `StructTreeRoot/…/Pg`.
