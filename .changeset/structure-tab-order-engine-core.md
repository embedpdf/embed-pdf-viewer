---
'@embedpdf/engine-core': minor
---

Every annotation has `structurePosition`: where it sits in the document's tags (its logical structure), as the index of each step from the structure tree's root down, or `null` when it isn't tagged. `tabOrderOf(annotations, pages)` puts annotations in the order Tab visits them, page by page, following each page's `tabOrder`: rows, columns, the tags' reading order for `'structure'` (annotations the tags leave out come after, in the order the page lists them), form fields first for `'widgets'`, and the page's own order otherwise. `compareStructurePositions()` compares two positions in that reading order.
