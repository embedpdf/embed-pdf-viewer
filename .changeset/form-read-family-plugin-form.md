---
'@embedpdf/plugin-form': minor
---

The form plugin's one mirror holds the fields and every widget row, from `doc.forms.list()`, and folds the rows each form event carries; widget boxes and actions come from it. `getWidget(widget)` returns a widget's row, and `getWidgets(ref)` every row of a field, in the field's order (a radio group's buttons, or a field shown on several pages). A widget is addressed by its annotation ref or as a field names it (`FormWidget`); a field ref is no longer accepted where a widget is meant.
