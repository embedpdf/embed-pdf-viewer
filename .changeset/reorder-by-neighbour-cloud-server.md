---
'@cloudpdf/server': minor
---

`POST …/pages/reorder`, `POST …/annotations/pages/{pageKey}/items/reorder` and `POST …/form/widgets/{pageKey}/reorder` replace the move routes; page inserts take a `position`. Audit kinds `annot.reorder`, `pages.reorder` and `form.reorderWidgets`. A reorder bumps only its family's pins: annotation reorders the annotation pins, widget reorders the form's.
