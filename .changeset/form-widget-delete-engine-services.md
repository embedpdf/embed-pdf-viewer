---
'@embedpdf/engine-services': minor
---

The `forms.deleteWidget` op: the widget leaves its field (field and widget dictionaries captured around it) and its page (the widget captured there). Its undo step brings it back at its place and re-attaches it, unless its field changed since; the undo's undo deletes it again.
