---
'@embedpdf/engine-services': minor
---

The form read builds every widget row from the pages (only widget rows: another annotation's subtype is read, never its row), and the annotation read builds no widget row. Appearance batches render one family. `forms.updateWidget` runs as a form op with its undo; annotation ops refuse widgets. Form results carry the rows of the widgets they changed.
