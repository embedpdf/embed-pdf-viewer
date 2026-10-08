---
'@embedpdf/engine-core': minor
---

Every move names a neighbour, never an index, and each family has its own reorder verb:
- **`ListPosition`:** `{ before: ref }`, `{ after: ref }`, `'start'` or `'end'` (`PagePosition`, `AnnotationPosition`), with `anchorOf`, `positionIndex`, `reorderedList` and `reorderPart`.
- **`doc.pages.reorder(pages, position)`** replaces `pages.move(pages, toIndex)` (`PageReorderInput`, `PageReorderResult` with the moved `pages`, `pages.reordered`). `pages.insert(bytes, position?)` and `pages.insertBlank(spec, position?)` take a position; `pages.inserted` loses `toIndex`.
- **`page.annotations.reorder(refs, position)`** replaces `annotations.move(refs, toIndex)`: it answers the page's whole new `order` as refs and publishes `annotations.reordered`. **`doc.forms.reorderWidgets(widgets, position)`** restacks a page's widgets, with `forms.widgetsReordered`. Widgets paint above every annotation, so each verb takes and anchors on its own family only: the other family is `InvalidArg` naming the right verb, a neighbour that's gone `NotFound`, one of the moved rows `InvalidArg`.
- **Change ops** `annotations.reorder` and `forms.reorderWidgets` (no `expect`) replace `annotations.move`; their undo puts each row back beside its old neighbours.
- **Annotation and widget rows lose `index`;** `PageLayout.index` stays. `annotationMoveEvents`, `AnnotationMoveResult`, `PageMoveResult` and `FormWidgetsMoveResult` are gone.
- Wire paths `…/items/reorder`, `…/pages/reorder` and `…/form/widgets/{pageKey}/reorder`, with their body and result schemas.
