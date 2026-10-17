---
'@embedpdf/engine': patch
---

Page renders draw the annotations and form fields the caller may read, and refuse asking for more. Moving annotations checks each one inside the write, so moving a widget takes `doc.forms.modify`. `security.allowsAnnotation` treats widgets as form design.
