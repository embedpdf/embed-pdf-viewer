---
'@embedpdf/web': minor
---

`fieldPlaceholderStyleOf()` places the words where the form plugin says the value will be (`placeholderAlign`, falling back to the field's text alignment), and `recordPlaceholderStyleOf()` where a lent placeholder says (`align`, falling back to the record's alignment). A signature field's and an image field's placeholder are centred.

`previewZIndexOf(source)` and `PREVIEW_Z_INDEX` say how a page layer stacks what isn't made yet: a tool's preview (`ghost`) and a drawing in progress (`draft`) rise above the layers after the annotation layer, the form's fields among them.
