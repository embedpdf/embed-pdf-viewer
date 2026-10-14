---
'@embedpdf/engine-runtime': patch
---

A widget no page's `/Annots` holds is placed on the page its `/P` names only when that is a page of the document: a `/P` left naming a deleted page puts the widget on no page (`EPDFForm_GetFieldWidgetPageObjNum` and the signature model answer 0).
