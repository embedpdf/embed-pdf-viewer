---
'@embedpdf/engine-services': patch
---

Annotation changes check each annotation they touch: a widget takes `doc.forms.modify` and never the annotation permissions. This covers creates, updates, deletes, moves and their undo. A move carries the caller's authority into the worker, as updates and deletes do.
