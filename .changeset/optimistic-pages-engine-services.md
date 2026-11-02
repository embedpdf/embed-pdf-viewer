---
'@embedpdf/engine-services': minor
---

Copy pages of the document (`pages.copy`), with their annotations and their form fields as fields of their own, and insert pages at the object numbers a caller names (`pages.insert` with `objectNumbers`). An undo of an insert or a copy deletes the form fields its pages brought along with the pages, and a redo brings both back.

Page edits now move `/PageLabels` with the pages: a section stays with the page it starts at, a page takes the numbering of the section it lands in, and an undo puts the sections back as they were. The page list reads its labels from the sections.
