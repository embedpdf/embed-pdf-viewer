---
'@cloudpdf/engine': minor
---

The cloud engine's `pages.reorder()`, `annotations.reorder()` and `forms.reorderWidgets()`, with positions on insert. A reorder moves only its own family's pins; remote `annot.reorder`, `pages.reorder` and `form.reorderWidgets` rows become the same events as locally.
